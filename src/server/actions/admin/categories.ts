'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { parentChoiceError } from '@/lib/category-tree'
import { IMAGE_HOST_ERROR, isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { withActionContext } from '@/lib/observability/action-context'
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

export type CategoryFormState = { error: string } | { success: string } | null

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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { id, ...fields } = parsed.data

  /**
   * THE GUARD THAT WAS ONLY EVER MARKUP.
   *
   * Until this ran, `parent_id` was validated as "a UUID" and nothing else. The
   * form's `<select>` filters the row's own id out of the options, and that
   * filter is client-side rendering: it shapes a dropdown, it does not inspect
   * a POST, and it has never had anything to say about the option that is the
   * real hazard, one of the row's own DESCENDANTS, which is a different id and
   * therefore passes the filter untouched.
   *
   * What a cycle costs here, measured against `CategoryTree.tsx`: `buildTree`
   * puts a node whose `parent_id` is present in the map under that parent, and
   * pushes to `roots` only when the parent is absent. Every row in a cycle has
   * a parent that is present, so NOTHING in the cycle reaches `roots` and the
   * rows disappear from `/admin/categories` entirely. Not greyed out, not
   * erroring: absent, from the one screen that could put them back. The same
   * cycle would also be an unbounded walk for `categoryAncestors`, which is why
   * that function carries its own limit as well; this stops it being written.
   *
   * Read on every write rather than cached: twelve rows on the admin's own save
   * path, and a stale tree here would approve exactly the move it exists to
   * refuse. `deleted_at is null` so a soft-deleted row cannot be chosen as a
   * parent, and inactive rows ARE included, because deactivating a category
   * does not stop it being part of a cycle.
   */
  if (fields.parent_id) {
    const { data: tree, error: treeError } = await supabase
      .from('categories')
      .select('id, slug, name_he, parent_id')
      .is('deleted_at', null)
    if (treeError) return { error: treeError.message }

    const problem = parentChoiceError(tree ?? [], id ?? null, fields.parent_id)
    if (problem) return { error: problem }
  }

  const { data: before } = id
    ? await supabase
        .from('categories')
        .select('id, slug, name_he, parent_id, is_active')
        .eq('id', id)
        .maybeSingle()
    : { data: null }

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
