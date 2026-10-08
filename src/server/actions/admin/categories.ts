'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { authoredGuideFor } from '@/lib/category-guides/authored'
import { GUIDE_BODY_MAX, GUIDE_TITLE_MAX, isMissingGuideSchema } from '@/lib/category-guides/rules'
import { IMAGE_HOST_ERROR, isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2, 'מזהה חייב להכיל לפחות 2 תווים')
    .regex(/^[a-z0-9-]+$/, 'מזהה יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד'),
  name_he: z.string().min(1, 'שם בעברית נדרש'),
  name_en: z.string().min(1, 'שם באנגלית נדרש'),
  description_he: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  // Same gate as coupon_deals.image_url: this URL is rendered on the category
  // tree and an un-allowlisted host is a throw, not a broken image.
  icon_url: z.string().refine(isAllowedImageUrl, IMAGE_HOST_ERROR).nullable().optional(),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.coerce.boolean().default(true),
})

/**
 * The buyer guide fields (STEP 65), parsed only when the form carries them:
 * the inline dialog on the list page opens without them for a category it
 * picked client-side, and the older tests post without them. Empty body =
 * "no row": the storefront falls back to the authored guide for the slug.
 */
const guideSchema = z.object({
  guide_title_he: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .min(2, 'כותרת המדריך קצרה מדי')
      .max(GUIDE_TITLE_MAX, 'כותרת המדריך ארוכה מדי')
      .nullable(),
  ),
  guide_body_md: z.string().max(GUIDE_BODY_MAX, 'מדריך הקנייה ארוך מדי'),
  guide_published: z.coerce.boolean().default(true),
})

type GuideFields = z.output<typeof guideSchema>

const GUIDE_MIGRATION_HINT = 'טבלת מדריכי הקנייה עוד לא הוחלה (מיגרציה 268).'

export type CategoryFormState = { error: string } | { success: string } | null

/**
 * Writes, replaces or removes the category's guide row on the service role.
 * Returns the Hebrew reason when it could not, and null when it did (or when
 * there was nothing to persist: the authored text, unchanged, on a database
 * that has no table yet is exactly what the storefront already shows).
 */
async function saveCategoryGuide(
  categoryId: string,
  slug: string,
  guide: GuideFields,
  session: Awaited<ReturnType<typeof requireAdminSession>>,
): Promise<string | null> {
  const body = guide.guide_body_md.trim()
  const admin = createAdminClient()

  if (body === '') {
    const { error } = await admin
      .from('category_guides' as never)
      .delete()
      .eq('category_id', categoryId)
    if (error && !isMissingGuideSchema(error)) return error.message
    if (!error) {
      await writeAuditLog({
        actorId: session.userId,
        actorRole: session.role,
        action: 'deleted',
        entityType: 'category_guides',
        entityId: categoryId,
      })
    }
    return null
  }

  const row = {
    category_id: categoryId,
    title_he: guide.guide_title_he,
    body_md: body,
    is_published: guide.guide_published,
    updated_by: session.userId,
  }
  const { error } = await admin
    .from('category_guides' as never)
    .upsert(row as never, { onConflict: 'category_id' })
  if (error) {
    if (!isMissingGuideSchema(error)) return error.message
    const authored = authoredGuideFor(slug)
    const unchanged =
      authored !== null &&
      guide.guide_published &&
      authored.body_md === body &&
      (authored.title_he ?? null) === guide.guide_title_he
    return unchanged ? null : GUIDE_MIGRATION_HINT
  }
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'category_guides',
    entityId: categoryId,
    changes: { title_he: row.title_he, is_published: row.is_published, body_length: body.length },
  })
  return null
}

async function runUpsertCategory(
  _: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    slug: formData.get('slug'),
    name_he: formData.get('name_he'),
    name_en: formData.get('name_en'),
    description_he: formData.get('description_he') || null,
    parent_id: formData.get('parent_id') || null,
    icon_url: formData.get('icon_url') || null,
    sort_order: formData.get('sort_order') ?? '0',
    is_active: formData.get('is_active') === 'true',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  let guide: GuideFields | null = null
  if (formData.has('guide_body_md')) {
    const parsedGuide = guideSchema.safeParse({
      guide_title_he: formData.get('guide_title_he') ?? '',
      guide_body_md: formData.get('guide_body_md') ?? '',
      guide_published: formData.get('guide_published') === 'true',
    })
    if (!parsedGuide.success) {
      return { error: parsedGuide.error.issues[0]?.message ?? 'מדריך הקנייה לא תקין' }
    }
    guide = parsedGuide.data
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { id, ...fields } = parsed.data
  const { data: before } = id
    ? await supabase
        .from('categories')
        .select('id, slug, name_he, parent_id, is_active')
        .eq('id', id)
        .maybeSingle()
    : { data: null }

  let categoryId = id
  if (id) {
    const { error } = await supabase.from('categories').update(fields).eq('id', id)
    if (error) return { error: error.message }
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'updated',
      entityType: 'categories',
      entityId: id,
      changes: { ...fields },
    })
  } else {
    const { data, error } = await supabase
      .from('categories')
      .insert({ ...fields, created_by: user!.id })
      .select('id')
      .single()
    if (error) return { error: error.message }
    categoryId = data.id
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'created',
      entityType: 'categories',
      entityId: data.id,
      changes: { ...fields },
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: id ? 'updated' : 'created',
    entityType: 'categories',
    entityId: id,
    changes: { old: before ?? null, new: { id: id ?? null, ...fields } },
  })

  revalidatePath('/admin/categories')
  updateTag(CATALOGUE_TAG)

  // The guide, after the category row it hangs off. A failure here leaves
  // the category saved and says so, rather than reporting a save that half
  // happened as one that did not.
  if (guide && categoryId) {
    const guideError = await saveCategoryGuide(categoryId, fields.slug, guide, session)
    updateTag(CacheTags.category(categoryId))
    if (guideError) {
      return { error: `הקטגוריה נשמרה, אבל מדריך הקנייה לא נשמר: ${guideError}` }
    }
  }
  return { success: id ? 'קטגוריה עודכנה' : 'קטגוריה נוצרה' }
}

async function runSoftDeleteCategory(id: string): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'categories',
    entityId: id,
  })

  revalidatePath('/admin/categories')
  updateTag(CATALOGUE_TAG)
  return {}
}

async function runDeleteCategory(id: string): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'categories',
    entityId: id,
    metadata: { hard_delete: true },
  })

  revalidatePath('/admin/categories')
  updateTag(CATALOGUE_TAG)
  return {}
}

async function runUpdateCategorySortOrder(
  id: string,
  sort_order: number,
): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').update({ sort_order }).eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'categories',
    entityId: id,
    changes: { sort_order },
  })

  revalidatePath('/admin/categories')
  updateTag(CATALOGUE_TAG)
  return {}
}

export async function upsertCategory(
  _: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  return withActionContext('admin.category.upsert', () => runUpsertCategory(_, formData))
}

export async function softDeleteCategory(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.category.soft_delete', () => runSoftDeleteCategory(id))
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.category.delete', () => runDeleteCategory(id))
}

export async function updateCategorySortOrder(
  id: string,
  sort_order: number,
): Promise<{ error?: string }> {
  return withActionContext('admin.category.update_sort_order', () =>
    runUpdateCategorySortOrder(id, sort_order),
  )
}
