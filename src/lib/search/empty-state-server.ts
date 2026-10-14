import 'server-only'

import { relaxQuery, searchHref } from '@/lib/search/empty-state'
import { facetedSearchCached } from '@/lib/search/faceted-server'
import { clearSearchFiltersHref } from '@/lib/search/results-page'

/**
 * The empty state's two engine-backed doors (UX21), verified before they are
 * offered.
 *
 * Before: "אולי התכוונתם ל״X״" was a guess. `relaxQuery` drops a word or a
 * prefix letter and the page printed the result without asking the engine,
 * so the link could land on a second empty page, and a narrowed search that
 * found nothing said "נסו להסיר סינון" with no link to do it and no idea
 * whether widening would help.
 *
 * Now both are one cheap search each (`limit=1`, the same request-scoped
 * engine the grid used, so the page's own search is never repeated):
 *
 *   - `unfiltered`: on a narrowed search, how many results the bare query
 *     has, and the URL that shows them. Offered as the first action when the
 *     count is above zero; when it is zero the page says so instead of
 *     sending the shopper through a link that lands on this same page.
 *   - `relaxed`: the shorter query only if it actually finds something, with
 *     its count, so "did you mean" is a promise the next page keeps.
 *
 * Engine errors are nulls: the empty state renders what it can, which is the
 * promoted terms and the categories it always had.
 */

export type EmptyStateVerification = {
  unfiltered: { total: number; href: string } | null
  relaxed: { query: string; total: number; href: string } | null
}

const MIN_QUERY = 2

async function countFor(q: string): Promise<number | null> {
  const outcome = await facetedSearchCached(new URLSearchParams({ q, limit: '1' }))
  return 'error' in outcome ? null : outcome.total
}

export async function verifyEmptySearch(input: {
  q: string
  params: URLSearchParams
  narrowed: boolean
}): Promise<EmptyStateVerification> {
  const relaxedQuery = relaxQuery(input.q)
  const wantRelaxed = relaxedQuery !== null && relaxedQuery.length >= MIN_QUERY

  const [unfilteredTotal, relaxedTotal] = await Promise.all([
    input.narrowed ? countFor(input.q) : Promise.resolve(null),
    wantRelaxed ? countFor(relaxedQuery) : Promise.resolve(null),
  ])

  return {
    unfiltered:
      input.narrowed && unfilteredTotal !== null
        ? { total: unfilteredTotal, href: clearSearchFiltersHref(input.params) }
        : null,
    relaxed:
      wantRelaxed && relaxedTotal !== null && relaxedTotal > 0
        ? { query: relaxedQuery, total: relaxedTotal, href: searchHref(relaxedQuery) }
        : null,
  }
}
