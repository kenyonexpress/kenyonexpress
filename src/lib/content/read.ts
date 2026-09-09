import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import {
  BUILT_IN_PAGES,
  type ContentPage,
  type ContentPageBody,
  contentPageHref,
} from '@/lib/content/pages'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The storefront's reads of `content_pages`, and the two ways they are allowed
 * to fail.
 *
 * ONE: THE TABLE DOES NOT EXIST. `migrations/pending/205_content_pages.sql` is
 * written and not applied, so this is the NORMAL state until somebody decides
 * otherwise, not an incident. PostgREST answers `PGRST205`/`42P01`, and the
 * read returns the built-in pages. It is logged once per process rather than
 * once per request, the way `recordPaymentDiscrepancies` does it: a line per
 * page view for a condition that is expected buries the log that matters.
 *
 * TWO: THE READ GENUINELY FAILED. Anything else goes through `orFail`, which
 * throws, which is what keeps `use cache` from storing the failure. That
 * distinction is the whole design: a missing table is an ANSWER ("no overrides
 * exist"), a broken connection is not, and collapsing the two would cache
 * "no overrides" for an hour the first time Supabase hiccuped.
 *
 * Reads go through the anon client, and the RLS policy in 205 only exposes
 * published rows. The service-role client is not used here on purpose: a
 * storefront read that could see drafts is one `.eq('status', ...)` away from
 * publishing an unfinished page, and that filter would live in application code
 * rather than in the database.
 *
 * TAGGED WITH `CATALOGUE_TAG` rather than a tag of its own. A content page is
 * edited a handful of times a year, so over-invalidating the catalogue costs a
 * cache refill nobody notices, and a second tag would need
 * `scripts/cache-invalidation-gate.mjs` to learn about it or the write path
 * would have to be added to that gate's exception list - which is how a save
 * that leaves the storefront stale for an hour stops being caught.
 */

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

let missingReported = false

function notApplied(error: { code?: string } | null | undefined): boolean {
  if (!error || !MISSING_TABLE.has(error.code ?? '')) return false
  if (!missingReported) {
    missingReported = true
    log.info('content_pages.not_applied', { migration: '205_content_pages.sql' })
  }
  return true
}

/** The row shape 205 defines. Not in the generated types until it is applied. */
type ContentPageRow = {
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

const COLUMNS =
  'slug, title, body_kind, body, faq_entries, seo_title, seo_description, og_image_url, bound_route, status, published_at, updated_at'

/**
 * A row's body, refusing anything that does not have the shape it claims.
 *
 * The CHECK constraints in 205 already refuse an empty published body and an
 * unknown `body_kind`, so this is the second of two locks rather than the only
 * one. It exists because `faq_entries` is `jsonb`: the database guarantees it
 * is valid JSON and an array, and nothing in Postgres promises the objects
 * inside it have two string fields. A malformed entry rendered as `undefined`
 * would be a blank question in a `FAQPage` rich result.
 */
function toBody(row: ContentPageRow): ContentPageBody | null {
  if (row.body_kind === 'prose') {
    return { kind: 'prose', markup: row.body ?? '' }
  }
  if (row.body_kind === 'faq') {
    const raw = Array.isArray(row.faq_entries) ? row.faq_entries : []
    const entries = raw.filter(
      (entry): entry is { question: string; answer: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { question?: unknown }).question === 'string' &&
        typeof (entry as { answer?: unknown }).answer === 'string',
    )
    if (entries.length !== raw.length) {
      log.warn('content_pages.faq_entry_dropped', { slug: row.slug, kept: entries.length })
    }
    return entries.length > 0 ? { kind: 'faq', entries } : null
  }
  log.warn('content_pages.unknown_body_kind', { slug: row.slug, kind: row.body_kind })
  return null
}

function toPage(row: ContentPageRow): ContentPage | null {
  const body = toBody(row)
  if (!body) return null
  return {
    slug: row.slug,
    title: row.title,
    body,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogImageUrl: row.og_image_url,
    boundRoute: row.bound_route,
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Every published page, keyed by slug, with the built-ins underneath.
 *
 * One read for all of them rather than one per slug. There are five today and
 * an operator can add more, but this is a table of page bodies and not a
 * catalogue: it is measured in tens of rows for the life of the site, and a
 * single cached read is what lets four route files and the sitemap share one
 * database round trip per cache period instead of five.
 */
async function readPublishedPages(): Promise<Record<string, ContentPage>> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const result = await supabase
    .from('content_pages' as never)
    .select(COLUMNS)
    .eq('status', 'published')
    .limit(500)

  if (notApplied(result.error)) return { ...BUILT_IN_PAGES }

  const rows = (orFail(result, 'content_pages.read_failed') ?? []) as unknown as ContentPageRow[]
  const pages: Record<string, ContentPage> = { ...BUILT_IN_PAGES }
  for (const row of rows) {
    const page = toPage(row)
    // A row that failed validation leaves the built-in in place rather than
    // replacing a good page with a broken one.
    if (page) pages[page.slug] = page
  }
  return pages
}

/** One published page, or null. Built-in text is the floor, never a hole. */
export async function getContentPage(slug: string): Promise<ContentPage | null> {
  const pages = await readPublishedPages()
  return pages[slug] ?? null
}

/**
 * A bound page's content for the route that owns its address.
 *
 * Returns the built-in rather than null, because the caller is a route that
 * exists whether or not the CMS does. `/about` renders text; the only question
 * this answers is whose text.
 */
export async function getBoundContentPage(slug: keyof typeof BUILT_IN_PAGES) {
  return (await getContentPage(slug)) ?? BUILT_IN_PAGES[slug]
}

/** Published pages as sitemap input: the address and when it last changed. */
export async function publishedContentPageEntries(): Promise<
  { path: string; updatedAt: string | null }[]
> {
  const pages = await readPublishedPages()
  return Object.values(pages)
    .filter((page) => page.status === 'published')
    .map((page) => ({ path: contentPageHref(page), updatedAt: page.updatedAt }))
    .sort((a, b) => a.path.localeCompare(b.path))
}
