import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { AUTHORED_LANDING_PAGES, authoredLandingPage } from '@/lib/landing/authored'
import type { LandingPage, LandingPageStatus } from '@/lib/landing/blocks'
import { parseLandingBlocks, parseLandingVariants } from '@/lib/landing/schema'
import { isLandingSlug } from '@/lib/landing/slug'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Landing pages, read from the database when it is there and from the
 * authored constants when it is not.
 *
 * THE LIVE READ IS CACHED AND TAGGED, which is the one place this departs
 * from the home page CMS. That file declined `'use cache'` because it had
 * no invalidation hook; this one has one: every admin save calls
 * `updateTag(CacheTags.landing)`, so an editor's change is visible on the
 * next request and a campaign page otherwise costs the database nothing
 * per visit. Under `cacheComponents` this is also what lets the page's
 * static shell carry the title: a cached read is allowed in the shell, an
 * uncached one is not.
 *
 * WHAT IS CACHED IS THE DOCUMENT, NEVER THE DECISION. Which variant a
 * visitor sees depends on their bucket cookie and is computed in the
 * dynamic half of the page; this module returns the whole document with
 * every variant and takes no cookie.
 *
 * MISSING TABLE IS AN ORDINARY STATE (42P01: 262 not applied). The authored
 * pages render, silently. Any other error is logged and reads as "no such
 * page", because a campaign page that 500s is worse than one that 404s:
 * the ad platform marks the first as a broken destination for hours.
 *
 * ROWS ARE RE-VALIDATED ON READ. A row whose blocks or variants fail the
 * schema is logged with the slug and treated as absent; the admin list
 * marks it so the editor can fix it. Rendering half a page would be the
 * worse outcome.
 */

/** Postgres: undefined_table. */
const UNDEFINED_TABLE = '42P01'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === UNDEFINED_TABLE || /relation .* does not exist/i.test(error.message ?? '')
}

type Row = {
  id: string
  slug: string
  title_he: string
  description_he: string | null
  hypothesis_he: string | null
  status?: string | null
  starts_at: string | null
  ends_at: string | null
  indexable: boolean
  campaign: string | null
  blocks: unknown
  variants: unknown
  updated_at: string | null
}

const COLUMNS =
  'id, slug, title_he, description_he, hypothesis_he, starts_at, ends_at, indexable, campaign, blocks, variants, updated_at'
const ADMIN_COLUMNS = `${COLUMNS}, status`

type QueryResult = { data: Row[] | null; error: { code?: string; message?: string } | null }

export type RowProblem = { slug: string; errors: string[] }

/**
 * A row into a page, or the reasons it is not one. `status` is absent on the
 * live view (every row there is published) and present on the base table.
 */
export function rowToLandingPage(row: Row): { page: LandingPage } | { problem: RowProblem } {
  const errors: string[] = []
  if (!isLandingSlug(row.slug)) errors.push('slug: לא תקין')
  const blocks = parseLandingBlocks(row.blocks)
  if (!blocks.ok) errors.push(...blocks.errors.map((line) => `blocks.${line}`))
  const variants = parseLandingVariants(row.variants)
  if (!variants.ok) errors.push(...variants.errors.map((line) => `variants.${line}`))
  if (errors.length > 0 || !blocks.ok || !variants.ok) {
    return { problem: { slug: row.slug, errors } }
  }
  const status: LandingPageStatus =
    row.status === 'draft' || row.status === 'archived' ? row.status : 'published'
  return {
    page: {
      id: row.id,
      slug: row.slug,
      titleHe: row.title_he,
      descriptionHe: row.description_he,
      hypothesisHe: row.hypothesis_he,
      status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      indexable: row.indexable,
      campaign: row.campaign,
      blocks: blocks.value,
      variants: variants.value,
      updatedAt: row.updated_at,
      source: 'database',
    },
  }
}

async function queryBySlug(source: string, columns: string, slug: string): Promise<QueryResult> {
  const admin = createAdminClient()
  return (await admin
    .from(source as never)
    .select(columns)
    .eq('slug', slug)
    .limit(1)) as unknown as QueryResult
}

function firstPage(
  result: QueryResult,
  slug: string,
  fallback: () => LandingPage | null,
): LandingPage | null {
  if (isMissingTable(result.error)) return fallback()
  if (result.error) {
    log.warn('landing.read_failed', { slug, reason: result.error.message })
    return null
  }
  const row = result.data?.[0]
  if (!row) return null
  const outcome = rowToLandingPage(row)
  if ('problem' in outcome) {
    log.warn('landing.row_invalid', { slug, errors: outcome.problem.errors.slice(0, 5) })
    return null
  }
  return outcome.page
}

/**
 * The published page at `/lp/<slug>` right now, through the scheduled view.
 * Cached per slug; `updateTag(CacheTags.landing)` on every admin save.
 */
export async function readLiveLandingPage(slug: string): Promise<LandingPage | null> {
  'use cache'
  cacheLife(CacheLife.list)
  cacheTag(CacheTags.landing, CacheTags.landingPage(slug))
  if (!isLandingSlug(slug)) return null
  try {
    const result = await queryBySlug('v_landing_pages_live', COLUMNS, slug)
    return firstPage(result, slug, () => authoredLandingPage(slug))
  } catch (error) {
    log.warn('landing.read_threw', { slug, reason: error instanceof Error ? error.message : '' })
    return null
  }
}

/**
 * The page in any status, ignoring the window: the admin preview. Uncached
 * and uncacheable on purpose (an editor wants the row as it is now), and
 * the caller must have checked for a panel session first.
 */
export async function readLandingPageForPreview(slug: string): Promise<LandingPage | null> {
  if (!isLandingSlug(slug)) return null
  try {
    const result = await queryBySlug('landing_pages', ADMIN_COLUMNS, slug)
    return firstPage(result, slug, () => authoredLandingPage(slug))
  } catch (error) {
    log.warn('landing.preview_threw', { slug, reason: error instanceof Error ? error.message : '' })
    return null
  }
}

export type LandingPageList = {
  pages: LandingPage[]
  /** Rows the schema rejected: listed so an editor can repair them. */
  problems: RowProblem[]
  /** Whether 262 is applied. False means `pages` is the authored set. */
  tableExists: boolean
}

/** Every row, newest first, for the admin list and the experiments report. Uncached. */
export async function listLandingPages(): Promise<LandingPageList> {
  try {
    const admin = createAdminClient()
    const result = (await admin
      .from('landing_pages' as never)
      .select(ADMIN_COLUMNS)
      .order('updated_at', { ascending: false })) as unknown as QueryResult
    if (isMissingTable(result.error)) {
      return { pages: [...AUTHORED_LANDING_PAGES], problems: [], tableExists: false }
    }
    if (result.error) {
      log.warn('landing.list_failed', { reason: result.error.message })
      return { pages: [], problems: [], tableExists: true }
    }
    const pages: LandingPage[] = []
    const problems: RowProblem[] = []
    for (const row of result.data ?? []) {
      const outcome = rowToLandingPage(row)
      if ('page' in outcome) pages.push(outcome.page)
      else problems.push(outcome.problem)
    }
    return { pages, problems, tableExists: true }
  } catch (error) {
    log.warn('landing.list_threw', { reason: error instanceof Error ? error.message : '' })
    return { pages: [], problems: [], tableExists: true }
  }
}

/** One row by id, any status, for the admin edit page. */
export async function readLandingPageById(id: string): Promise<LandingPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return authoredLandingPage(id.replace(/^authored-/, ''))
  try {
    const admin = createAdminClient()
    const result = (await admin
      .from('landing_pages' as never)
      .select(ADMIN_COLUMNS)
      .eq('id', id)
      .limit(1)) as unknown as QueryResult
    if (result.error || !result.data?.[0]) return null
    const outcome = rowToLandingPage(result.data[0])
    return 'page' in outcome ? outcome.page : null
  } catch {
    return null
  }
}
