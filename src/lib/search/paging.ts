/**
 * Paging on the results page (UX21). Pure, and tiny on purpose: both
 * `facet-links.ts` (which turns the page's URL into the engine's params) and
 * `results-page.ts` (which turns the engine's total back into page links)
 * read these, and a cycle between the two would be the alternative.
 *
 * Before UX21 the page asked the engine for 48 hits and showed them all:
 * result 49 of a popular query did not exist, and nothing on the page said
 * so. Now the page is 24 wide (the engine's own default), `?page=N` is the
 * offset, and the archive's pagination draws the links.
 */

export const SEARCH_PAGE_SIZE = 24

/**
 * The engine's offset ceiling is 1000 (`parseFacetedParams`), so the last page
 * that can be asked for is the one whose offset still fits under it.
 */
export const MAX_SEARCH_PAGE = Math.floor(1000 / SEARCH_PAGE_SIZE) + 1

/** `?page=` as typed: a positive integer, else the first page; capped. */
export function parseSearchPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !/^\d{1,4}$/.test(value.trim())) return 1
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return 1
  return Math.min(n, MAX_SEARCH_PAGE)
}

export function searchOffset(page: number, pageSize = SEARCH_PAGE_SIZE): number {
  return Math.max(0, page - 1) * pageSize
}

/** At least one page, never more than the engine can be asked for. */
export function totalSearchPages(total: number, pageSize = SEARCH_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  return Math.min(MAX_SEARCH_PAGE, Math.ceil(total / pageSize))
}
