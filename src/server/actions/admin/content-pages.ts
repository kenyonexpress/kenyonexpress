'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { CONTENT_NOT_APPLIED, contentTableMissing } from '@/lib/admin/content-pages'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { parseFaqText } from '@/lib/content/faq-text'
import { CONTENT_SLUG_PATTERN, RESERVED_CONTENT_SLUGS } from '@/lib/content/pages'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * The content-page console's writes.
 *
 * EVERY WRITE GOES THROUGH A DATABASE FUNCTION, not through PostgREST. 205
 * explains why in full; the short version is that a page update and its
 * revision row have to be one transaction, and the revision NUMBER has to be
 * allocated under a lock or two operators saving at the same moment collide.
 * Expressed as `update` then `insert` from here, both failures are silent: the
 * first loses the history for that edit, the second shows one of them a
 * constraint error instead of a saved page.
 *
 * ADMIN ONLY, NOT `content_uploader`. That role exists to load catalogue copy -
 * products, categories, coupon deals - and `permissions.ts` already keeps it
 * away from anything that is not the catalogue. These pages are what the
 * business says about itself: the about page describes how refunds work and the
 * FAQ answers questions about cancellation rights, and under Israeli consumer
 * law a factual claim on a marketing page binds the business. That is not a
 * catalogue permission.
 *
 * `updateTag(CATALOGUE_TAG)` on every path. The storefront reads content pages
 * inside a `use cache` scope tagged with it, so a save without this leaves the
 * old text on the site for up to an hour while the admin sees the new one -
 * the exact silent staleness `scripts/cache-invalidation-gate.mjs` exists for.
 */

export type ContentPageActionState = { error: string } | { success: string } | null

const bodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(CONTENT_SLUG_PATTERN, 'הכתובת חייבת להיות באותיות לטיניות קטנות, ספרות ומקפים'),
  title: z.string().trim().min(2).max(200),
  bodyKind: z.enum(['prose', 'faq']),
  body: z.string().max(60_000),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  ogImageUrl: z.string().trim().max(500).optional(),
  status: z.enum(['draft', 'published']),
  note: z.string().trim().max(500).optional(),
})

/** Empty means "no override", which is not the same as an empty string. */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name)
  return typeof value === 'string' ? value : undefined
}

async function runSaveContentPage(
  _: ContentPageActionState,
  formData: FormData,
): Promise<ContentPageActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = bodySchema.safeParse({
    slug: field(formData, 'slug'),
    title: field(formData, 'title'),
    bodyKind: field(formData, 'bodyKind'),
    body: field(formData, 'body') ?? '',
    seoTitle: field(formData, 'seoTitle'),
    seoDescription: field(formData, 'seoDescription'),
    ogImageUrl: field(formData, 'ogImageUrl'),
    status: field(formData, 'status'),
    note: field(formData, 'note'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  const input = parsed.data

  // A new page may not take a built-in slug. `/page/about` alongside `/about`
  // is the duplicate `bound_route` exists to prevent, and the built-in rows are
  // reached by editing them, not by creating them again.
  const existing = await pageIdForSlug(input.slug)
  if (existing === 'missing') return { error: CONTENT_NOT_APPLIED }
  if (existing === null && RESERVED_CONTENT_SLUGS.includes(input.slug)) {
    return { error: 'הכתובת הזאת שמורה. ערכו את העמוד הקיים במקום ליצור אותו מחדש.' }
  }

  const faqEntries = input.bodyKind === 'faq' ? parseFaqText(input.body) : []
  if (input.status === 'published') {
    if (input.bodyKind === 'faq' && faqEntries.length === 0) {
      return { error: 'אי אפשר לפרסם עמוד שאלות בלי שאלה אחת לפחות' }
    }
    if (input.bodyKind === 'prose' && input.body.trim().length === 0) {
      return { error: 'אי אפשר לפרסם עמוד בלי תוכן' }
    }
  }
  // A description shorter than the CHECK's floor is refused here with a
  // sentence rather than there with a constraint name.
  const seoDescription = orNull(input.seoDescription)
  if (seoDescription !== null && seoDescription.length < 20) {
    return { error: 'תיאור ה-SEO קצר מדי. השאירו ריק כדי שייגזר מהתוכן.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc(
    'save_content_page' as never,
    {
      p_slug: input.slug,
      p_title: input.title,
      p_body_kind: input.bodyKind,
      p_body: input.bodyKind === 'prose' ? input.body : '',
      p_faq_entries: faqEntries,
      p_seo_title: orNull(input.seoTitle),
      p_seo_description: seoDescription,
      p_og_image_url: orNull(input.ogImageUrl),
      p_status: input.status,
      p_actor: session.userId,
      p_note: orNull(input.note),
    } as never,
  )

  if (error) {
    if (contentTableMissing(error)) return { error: CONTENT_NOT_APPLIED }
    log.error('admin.content_page_save_failed', { slug: input.slug, reason: error.message })
    return { error: 'השמירה נכשלה' }
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { page_id: string; revision: number }
    | undefined

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: existing === null ? 'created' : 'updated',
    entityType: 'content_page',
    entityId: result?.page_id ?? null,
    changes: {
      slug: input.slug,
      status: input.status,
      body_kind: input.bodyKind,
      revision: result?.revision ?? null,
    },
  })

  await invalidate(input.slug)
  return { success: `נשמר. גרסה ${result?.revision ?? ''}`.trim() }
}

const statusSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1),
  status: z.enum(['draft', 'published']),
})

async function runSetContentPageStatus(
  _: ContentPageActionState,
  formData: FormData,
): Promise<ContentPageActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = statusSchema.safeParse({
    id: field(formData, 'id'),
    slug: field(formData, 'slug'),
    status: field(formData, 'status'),
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin.rpc(
    'set_content_page_status' as never,
    {
      p_page_id: parsed.data.id,
      p_status: parsed.data.status,
      p_actor: session.userId,
    } as never,
  )

  if (error) {
    if (contentTableMissing(error)) return { error: CONTENT_NOT_APPLIED }
    // The CHECK refuses publishing an empty body, and that is the likely
    // failure here rather than an outage: the message says which.
    log.error('admin.content_status_failed', { slug: parsed.data.slug, reason: error.message })
    return {
      error:
        parsed.data.status === 'published' ? 'הפרסום נדחה. ודאו שיש תוכן בעמוד.' : 'העדכון נכשל',
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'content_page',
    entityId: parsed.data.id,
    changes: { slug: parsed.data.slug, status: parsed.data.status },
  })

  await invalidate(parsed.data.slug)
  return { success: parsed.data.status === 'published' ? 'העמוד פורסם' : 'העמוד הוסר מפרסום' }
}

const rollbackSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1),
  revision: z.coerce.number().int().positive(),
})

async function runRollbackContentPage(
  _: ContentPageActionState,
  formData: FormData,
): Promise<ContentPageActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = rollbackSchema.safeParse({
    id: field(formData, 'id'),
    slug: field(formData, 'slug'),
    revision: field(formData, 'revision'),
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc(
    'rollback_content_page' as never,
    {
      p_page_id: parsed.data.id,
      p_revision: parsed.data.revision,
      p_actor: session.userId,
    } as never,
  )

  if (error) {
    if (contentTableMissing(error)) return { error: CONTENT_NOT_APPLIED }
    log.error('admin.content_rollback_failed', {
      slug: parsed.data.slug,
      revision: parsed.data.revision,
      reason: error.message,
    })
    return { error: 'השחזור נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    // `restored` and not `updated`: an audit reader looking for "who put the
    // old text back" should not have to read the changes column to find it.
    action: 'restored',
    entityType: 'content_page',
    entityId: parsed.data.id,
    changes: { slug: parsed.data.slug, restored_from: parsed.data.revision, revision: data },
  })

  await invalidate(parsed.data.slug)
  return { success: `שוחזרה גרסה ${parsed.data.revision}` }
}

/**
 * Look up a page id, distinguishing "no row" from "no table".
 *
 * The distinction decides whether a save is a create or an update, which is
 * what the audit row says, and it is the difference between telling an operator
 * the migration is not applied and telling them nothing.
 */
async function pageIdForSlug(slug: string): Promise<string | null | 'missing'> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_pages' as never)
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (error) return contentTableMissing(error) ? 'missing' : null
  return data ? ((data as unknown as { id: string }).id ?? null) : null
}

/**
 * Expire everything that could be showing the old copy.
 *
 * The tag covers the storefront's cached read. The paths cover the admin's own
 * uncached pages, so the operator sees their save reflected in the list they
 * are returned to rather than the state before it.
 */
async function invalidate(slug: string): Promise<void> {
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/pages')
  revalidatePath(`/admin/pages/${slug}`)
}

export async function saveContentPage(
  state: ContentPageActionState,
  formData: FormData,
): Promise<ContentPageActionState> {
  return withActionContext('admin.content_page_save', () => runSaveContentPage(state, formData))
}

export async function setContentPageStatus(
  state: ContentPageActionState,
  formData: FormData,
): Promise<ContentPageActionState> {
  return withActionContext('admin.content_page_status', () =>
    runSetContentPageStatus(state, formData),
  )
}

export async function rollbackContentPage(
  state: ContentPageActionState,
  formData: FormData,
): Promise<ContentPageActionState> {
  return withActionContext('admin.content_page_rollback', () =>
    runRollbackContentPage(state, formData),
  )
}
