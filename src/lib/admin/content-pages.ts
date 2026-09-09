import {
  BUILT_IN_PAGES,
  type ContentPage,
  type ContentPageStatus,
  contentPageHref,
} from '@/lib/content/pages'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The admin panel's reads of `content_pages`, which see drafts.
 *
 * SEPARATE FILE FROM THE ACTIONS ON PURPOSE. Everything exported from a
 * `'use server'` module becomes a callable endpoint, so a read helper living
 * beside the mutations would be a public POST route that returns unpublished
 * copy. These are plain async functions imported by server components.
 *
 * THEY USE THE SERVICE ROLE, which is the whole reason they are not the
 * storefront's reads: `content_page_revisions` has no policy for anyone, and
 * `content_pages` only exposes published rows to anon. The pages that call
 * these are behind `requireAdminSession`.
 */

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

export function contentTableMissing(error: { code?: string } | null | undefined): boolean {
  return error !== null && error !== undefined && MISSING_TABLE.has(error.code ?? '')
}

export const CONTENT_NOT_APPLIED =
  'הטבלאות עדיין לא הוחלו. ראו migrations/pending/205_content_pages.sql'

const COLUMNS =
  'id, slug, title, body_kind, body, faq_entries, seo_title, seo_description, og_image_url, bound_route, status, published_at, updated_at'

type Row = {
  id: string
  slug: string
  title: string
  body_kind: string
  body: string | null
  faq_entries: unknown
  seo_title: string | null
  seo_description: string | null
  og_image_url: string | null
  bound_route: string | null
  status: string
  published_at: string | null
  updated_at: string | null
}

/**
 * A page as the editor sees it: the model, plus where the values came from.
 *
 * `id` is null for a page that has no row yet, and that is a state the admin
 * has to show rather than hide. Four of the five built-ins have no row until
 * somebody saves them, and an editor that presented them as ordinary rows would
 * offer a "revision history" for a page with no history and an "unpublish"
 * button for a page that cannot be unpublished because it is compiled in.
 */
export type AdminContentPage = ContentPage & {
  id: string | null
  href: string
  /** True when this is compiled-in text with no database row behind it. */
  builtIn: boolean
}

function toAdminPage(row: Row): AdminContentPage {
  const entries = Array.isArray(row.faq_entries)
    ? row.faq_entries.filter(
        (entry): entry is { question: string; answer: string } =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { question?: unknown }).question === 'string' &&
          typeof (entry as { answer?: unknown }).answer === 'string',
      )
    : []

  const page: ContentPage = {
    slug: row.slug,
    title: row.title,
    body:
      row.body_kind === 'faq'
        ? { kind: 'faq', entries }
        : { kind: 'prose', markup: row.body ?? '' },
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImageUrl: row.og_image_url,
    boundRoute: row.bound_route,
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }

  return { ...page, id: row.id, href: contentPageHref(page), builtIn: false }
}

function builtInAsAdminPage(page: ContentPage): AdminContentPage {
  return { ...page, id: null, href: contentPageHref(page), builtIn: true }
}

/**
 * Every page the operator can edit: the rows, with the built-ins filling the
 * gaps.
 *
 * The built-ins are listed even when they have no row, because they ARE on the
 * site. A console that showed only rows would show an empty list on the day
 * this ships and give an operator no way to reach `/about` - the page they came
 * to edit.
 */
export async function listContentPages(): Promise<{ pages: AdminContentPage[]; applied: boolean }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_pages' as never)
    .select(COLUMNS)
    .order('slug', { ascending: true })

  if (contentTableMissing(error)) {
    return { pages: Object.values(BUILT_IN_PAGES).map(builtInAsAdminPage), applied: false }
  }
  if (error) {
    log.error('admin.content_pages_read_failed', { reason: error.message })
    return { pages: Object.values(BUILT_IN_PAGES).map(builtInAsAdminPage), applied: false }
  }

  const rows = ((data ?? []) as unknown as Row[]).map(toAdminPage)
  const bySlug = new Map(rows.map((page) => [page.slug, page]))
  for (const page of Object.values(BUILT_IN_PAGES)) {
    if (!bySlug.has(page.slug)) bySlug.set(page.slug, builtInAsAdminPage(page))
  }

  return {
    pages: [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    applied: true,
  }
}

/** One page for the editor, falling back to the built-in when there is no row. */
export async function getAdminContentPage(slug: string): Promise<AdminContentPage | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_pages' as never)
    .select(COLUMNS)
    .eq('slug', slug)
    .maybeSingle()

  if (error && !contentTableMissing(error)) {
    log.error('admin.content_page_read_failed', { slug, reason: error.message })
  }
  if (data) return toAdminPage(data as unknown as Row)

  const builtIn = Object.values(BUILT_IN_PAGES).find((page) => page.slug === slug)
  return builtIn ? builtInAsAdminPage(builtIn) : null
}

export type ContentRevision = {
  revision: number
  title: string
  status: ContentPageStatus
  note: string | null
  createdAt: string
  actorEmail: string | null
}

/**
 * A page's history, newest first.
 *
 * The BODY of each revision is deliberately not selected. The list is a list;
 * fetching twelve full bodies to render twelve dates is a page that gets slower
 * every time somebody fixes a typo. The body is read when a revision is
 * actually restored, by `rollback_content_page`, inside the database.
 */
export async function listContentRevisions(pageId: string): Promise<ContentRevision[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('content_page_revisions' as never)
    .select('revision, title, status, note, created_at, created_by')
    .eq('page_id', pageId)
    .order('revision', { ascending: false })
    .limit(200)

  if (error) {
    if (!contentTableMissing(error)) {
      log.error('admin.content_revisions_read_failed', { pageId, reason: error.message })
    }
    return []
  }

  const rows = (data ?? []) as unknown as {
    revision: number
    title: string
    status: string
    note: string | null
    created_at: string
    created_by: string | null
  }[]

  // One extra query for the actor names rather than a join, because
  // `content_page_revisions` is not in the generated types and a PostgREST
  // embed on an untyped relation is a string the compiler cannot check.
  const actorIds = [...new Set(rows.map((row) => row.created_by).filter((id) => id !== null))]
  const emails = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', actorIds as string[])
    // Named and logged rather than discarded, but NOT fatal: the history is
    // still worth reading with the addresses missing, and a failed lookup of
    // who edited a page must not turn the page that lists the edits into a 500.
    if (profileError) {
      log.warn('admin.content_revision_actors_failed', { pageId, reason: profileError.message })
    }
    for (const profile of profiles ?? []) {
      if (profile.email) emails.set(profile.id, profile.email)
    }
  }

  return rows.map((row) => ({
    revision: row.revision,
    title: row.title,
    status: row.status === 'published' ? 'published' : 'draft',
    note: row.note,
    createdAt: row.created_at,
    actorEmail: row.created_by ? (emails.get(row.created_by) ?? null) : null,
  }))
}
