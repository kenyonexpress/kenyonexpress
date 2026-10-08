'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { BANNER_THEMES, isInternalHref, isMissingBannerSchema } from '@/lib/category-banners/rules'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

// Admin composition of category landing banners (STEP 62).
//
// A banner is catalogue copy: a headline, a picture and a link into the
// catalogue. It moves no money, so it sits under the `catalog` section like
// categories and landing pages: content_uploader may author one, support
// cannot see the list. The page gate is layer 3 of 4 and every action here
// re-checks, because a server action is directly addressable.
//
// Every write is the service role. The table carries a `has_role('admin')`
// policy as well, but the admin client has no auth.uid(), which is why each
// write below carries its own audit row naming the actor.

/** Postgres: foreign_key_violation. A category id that is not a category. */
const FK_VIOLATION = '23503'
/** Postgres: check_violation. The database refused what the schema below let through. */
const CHECK_VIOLATION = '23514'

const MIGRATION_HINT = 'טבלת הבאנרים עוד לא הוחלה (מיגרציה 267).'

const optionalText = (max: number, tooLong: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max, tooLong).nullable(),
  )

const optionalInstant = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable(),
)

const schema = z
  .object({
    id: z.string().uuid().optional(),
    category_id: z.string().uuid('בחרו קטגוריה'),
    title_he: z
      .string()
      .trim()
      .min(2, 'הכותרת חייבת להכיל לפחות 2 תווים')
      .max(120, 'הכותרת ארוכה מדי'),
    subtitle_he: optionalText(240, 'שורת המשנה ארוכה מדי'),
    image_url: z.string().trim().min(1, 'נא להעלות תמונה').max(2000, 'כתובת התמונה ארוכה מדי'),
    image_alt_he: z
      .string()
      .trim()
      .min(2, 'נדרש טקסט חלופי לתמונה')
      .max(200, 'הטקסט החלופי ארוך מדי'),
    cta_label_he: optionalText(60, 'טקסט הכפתור ארוך מדי'),
    cta_href: optionalText(500, 'הקישור ארוך מדי'),
    theme: z.enum(BANNER_THEMES as [string, ...string[]], { message: 'ערכת צבע לא מוכרת' }),
    starts_at: optionalInstant,
    ends_at: optionalInstant,
    priority: z.coerce
      .number()
      .int('עדיפות היא מספר שלם')
      .min(-1000, 'עדיפות נמוכה מדי')
      .max(1000, 'עדיפות גבוהה מדי'),
    is_active: z.coerce.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const start = v.starts_at === null ? null : Date.parse(v.starts_at)
    const end = v.ends_at === null ? null : Date.parse(v.ends_at)
    if (start !== null && Number.isNaN(start)) {
      ctx.addIssue({ code: 'custom', path: ['starts_at'], message: 'תאריך התחלה לא תקין' })
    }
    if (end !== null && Number.isNaN(end)) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'תאריך סיום לא תקין' })
    }
    if (
      start !== null &&
      end !== null &&
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      start >= end
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'הסיום חייב להיות אחרי ההתחלה',
      })
    }
    // Both or neither: a label with nowhere to go, or a path with no label.
    if ((v.cta_label_he === null) !== (v.cta_href === null)) {
      ctx.addIssue({
        code: 'custom',
        path: [v.cta_label_he === null ? 'cta_label_he' : 'cta_href'],
        message: 'כפתור צריך גם טקסט וגם קישור',
      })
    }
    if (v.cta_href !== null && !isInternalHref(v.cta_href)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cta_href'],
        message: 'הקישור חייב להיות נתיב פנימי שמתחיל ב-/',
      })
    }
  })

export type CategoryBannerActionState = {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  /** The saved banner's id, so a new one can navigate to its edit page. */
  id?: string
}

type Saved = { id: string; category_id: string; categories: unknown }

const toInstant = (local: string | null): string | null =>
  local === null ? null : new Date(local).toISOString()

async function runSaveCategoryBanner(
  _prev: CategoryBannerActionState,
  formData: FormData,
): Promise<CategoryBannerActionState> {
  const session = await requireSection('catalog', 'write')

  const raw = Object.fromEntries(formData) as Record<string, unknown>
  const parsed = schema.safeParse({
    ...raw,
    id: raw.id === '' ? undefined : raw.id,
    theme: raw.theme === '' || raw.theme === undefined ? 'light' : raw.theme,
    priority: raw.priority === '' || raw.priority === undefined ? 0 : raw.priority,
    is_active: raw.is_active === 'on' || raw.is_active === 'true',
  })
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const v = parsed.data

  const row = {
    category_id: v.category_id,
    title_he: v.title_he,
    subtitle_he: v.subtitle_he,
    image_url: v.image_url,
    image_alt_he: v.image_alt_he,
    cta_label_he: v.cta_label_he,
    cta_href: v.cta_href,
    theme: v.theme,
    starts_at: toInstant(v.starts_at),
    ends_at: toInstant(v.ends_at),
    priority: v.priority,
    is_active: v.is_active,
  }

  const admin = createAdminClient()
  // The previous category is read before the write so a banner moved from
  // one category to another stales BOTH category pages.
  const before = v.id
    ? await admin
        .from('category_banners' as never)
        .select('category_id')
        .eq('id', v.id)
        .maybeSingle()
    : null
  const previousCategoryId = (before?.data as { category_id: string } | null)?.category_id ?? null

  const saved = v.id
    ? await admin
        .from('category_banners' as never)
        .update(row as never)
        .eq('id', v.id)
        .select('id, category_id, categories(slug)')
        .maybeSingle()
    : await admin
        .from('category_banners' as never)
        .insert({ ...row, created_by: session.userId } as never)
        .select('id, category_id, categories(slug)')
        .single()

  if (saved.error) {
    if (isMissingBannerSchema(saved.error)) return { ok: false, error: MIGRATION_HINT }
    if (saved.error.code === FK_VIOLATION) {
      return { ok: false, fieldErrors: { category_id: ['הקטגוריה אינה קיימת'] } }
    }
    if (saved.error.code === CHECK_VIOLATION) {
      return { ok: false, error: `הנתונים נדחו על ידי בסיס הנתונים: ${saved.error.message}` }
    }
    return { ok: false, error: `שמירה נכשלה: ${saved.error.message}` }
  }
  const data = saved.data as Saved | null
  const bannerId = data?.id ?? v.id ?? null
  if (!bannerId) return { ok: false, error: 'הבאנר לא נמצא.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: v.id ? 'updated' : 'created',
    entityType: 'category_banners',
    entityId: bannerId,
    changes: row,
  })

  revalidateBanners(bannerId, [v.category_id, previousCategoryId], slugOf(data))
  return { ok: true, id: bannerId }
}

/** The kill switch: one flag, no form. */
async function runSetCategoryBannerActive(
  id: string,
  isActive: boolean,
): Promise<CategoryBannerActionState> {
  const session = await requireSection('catalog', 'write')
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'מזהה לא תקין' }

  const { data, error } = await createAdminClient()
    .from('category_banners' as never)
    .update({ is_active: isActive } as never)
    .eq('id', id)
    .select('id, category_id, categories(slug)')
    .maybeSingle()
  if (error) {
    if (isMissingBannerSchema(error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `עדכון נכשל: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'category_banners',
    entityId: id,
    changes: { is_active: isActive },
  })

  const saved = data as Saved | null
  revalidateBanners(id, [saved?.category_id ?? null], slugOf(saved))
  return { ok: true, id }
}

/** Hard delete. The counters cascade with the banner. */
async function runDeleteCategoryBanner(id: string): Promise<CategoryBannerActionState> {
  const session = await requireSection('catalog', 'write')
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'מזהה לא תקין' }

  const { data, error } = await createAdminClient()
    .from('category_banners' as never)
    .delete()
    .eq('id', id)
    .select('id, category_id, categories(slug)')
    .maybeSingle()
  if (error) {
    if (isMissingBannerSchema(error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `מחיקה נכשלה: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'category_banners',
    entityId: id,
  })

  const removed = data as Saved | null
  revalidateBanners(id, [removed?.category_id ?? null], slugOf(removed))
  return { ok: true }
}

function slugOf(saved: Saved | null): string | null {
  const embed = saved?.categories
  const category = Array.isArray(embed) ? (embed[0] ?? null) : embed
  const slug = (category as { slug?: unknown } | null)?.slug
  return typeof slug === 'string' && slug.length > 0 ? slug : null
}

/**
 * The category page reads through the category's own cache tag; the
 * umbrella tag is staled too so a list that embeds the banner follows. Both
 * admin pages are revalidated so an admin checking their own change sees it.
 */
function revalidateBanners(id: string, categoryIds: (string | null)[], slug: string | null) {
  updateTag(CATALOGUE_TAG)
  for (const categoryId of new Set(categoryIds)) {
    if (categoryId) updateTag(CacheTags.category(categoryId))
  }
  if (slug) revalidatePath(`/category/${slug}`)
  revalidatePath('/admin/category-banners')
  revalidatePath(`/admin/category-banners/${id}`)
}

export async function saveCategoryBanner(
  prev: CategoryBannerActionState,
  formData: FormData,
): Promise<CategoryBannerActionState> {
  return withActionContext('admin.category_banner.save', () =>
    runSaveCategoryBanner(prev, formData),
  )
}

export async function setCategoryBannerActive(
  id: string,
  isActive: boolean,
): Promise<CategoryBannerActionState> {
  return withActionContext('admin.category_banner.set_active', () =>
    runSetCategoryBannerActive(id, isActive),
  )
}

export async function deleteCategoryBanner(id: string): Promise<CategoryBannerActionState> {
  return withActionContext('admin.category_banner.delete', () => runDeleteCategoryBanner(id))
}
