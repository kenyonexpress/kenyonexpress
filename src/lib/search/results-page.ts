import { FACET_PARAM, type FacetName, activeFacetChips } from '@/lib/search/facet-links'
import { SEARCH_PAGE_SIZE, searchOffset, totalSearchPages } from '@/lib/search/paging'

/**
 * The results page's own controls (UX21): the sort, the active-filter strip
 * above the grid, the count line, and the parameters a page link carries.
 * Pure functions over the page's URLSearchParams, so every rule here is a
 * unit test away and the page stays a server component that reads the URL.
 *
 * MEASURED BEFORE (logs/ux21/before.json, 380 / 768 / 1440): the engine
 * accepted `sort=` and nothing on the page set it; the facet navigation sat
 * 2011px down a 380 page, below the grid and the viewport; a narrowed search
 * that found nothing showed its chips 800px UNDER the empty state; the empty
 * state offered no way to drop the filter; and the page showed 48 hits with
 * no page two.
 */

/** The filters disclosure's id: the control bar's phone link opens it. */
export const SEARCH_FILTERS_ID = 'search-filters'

export const SEARCH_SORT_OPTIONS = [
  { value: 'relevance', label: 'הרלוונטיים ביותר' },
  { value: 'newest', label: 'החדשים ביותר' },
  { value: 'price_asc', label: 'מחיר: מהנמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: מהגבוה לנמוך' },
] as const

export type SearchSortValue = (typeof SEARCH_SORT_OPTIONS)[number]['value']

/** The default is relevance, which is the engine's own order and no `sort=`. */
export const DEFAULT_SEARCH_SORT: SearchSortValue = 'relevance'

export function parseSearchSort(raw: string | string[] | undefined): SearchSortValue {
  const value = Array.isArray(raw) ? raw[0] : raw
  const found = SEARCH_SORT_OPTIONS.find((option) => option.value === value)
  return found ? found.value : DEFAULT_SEARCH_SORT
}

/**
 * The parameters that name THIS search, without its page: what a page link,
 * the facet links and the save button all preserve. Price under the engine's
 * names, because `toFacetSearchParams` has already folded the sidebar's
 * `min`/`max` into them.
 */
const LINK_KEYS = [
  'q',
  'sort',
  'type',
  'category',
  'city',
  'brand',
  'tag',
  'in_stock',
  'price_min',
  'price_max',
] as const

export function searchLinkParams(current: URLSearchParams): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {}
  for (const key of LINK_KEYS) {
    const value = current.get(key)?.trim()
    if (value) params[key] = value
  }
  return params
}

/**
 * A whole-shekel bound as the chip reads it. The values are what the shopper
 * typed, shown back with the sign after the digits as everywhere on the site;
 * nothing is computed from them.
 */
export function priceChipLabel(min: string | null, max: string | null): string {
  const lo = min ? `⁦${min} ₪⁩` : null
  const hi = max ? `⁦${max} ₪⁩` : null
  if (lo && hi) return `${lo} עד ${hi}`
  if (lo) return `מ-${lo}`
  return `עד ${hi}`
}

export type SearchChip = {
  /** The facet, or `price` for the pair of bounds. */
  key: FacetName | 'price'
  label: string
  valueLabel: string
  /** The search without this chip, page dropped. */
  href: string
}

/** The URL with everything but the query and the sort removed. */
export function clearSearchFiltersHref(current: URLSearchParams, pathname = '/search'): string {
  const next = new URLSearchParams()
  for (const key of ['q', 'sort'] as const) {
    const value = current.get(key)
    if (value) next.set(key, value)
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** The URL with the price bounds dropped and every facet kept. */
function hrefWithoutPrice(current: URLSearchParams, pathname = '/search'): string {
  const next = new URLSearchParams()
  for (const key of ['q', 'sort'] as const) {
    const value = current.get(key)
    if (value) next.set(key, value)
  }
  for (const facet of Object.keys(FACET_PARAM) as FacetName[]) {
    const kept = current.get(FACET_PARAM[facet])
    if (kept) next.set(FACET_PARAM[facet], kept)
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * The strip above the grid: one chip per facet the URL narrows by, then one
 * for the price range when either bound is set. Each chip links to the search
 * without itself.
 */
export function activeSearchChips(current: URLSearchParams, pathname = '/search'): SearchChip[] {
  const chips: SearchChip[] = activeFacetChips(current, pathname).map((chip) => ({
    key: chip.name,
    label: chip.label,
    valueLabel: chip.valueLabel,
    href: chip.href,
  }))
  const min = current.get('price_min')
  const max = current.get('price_max')
  if (min || max) {
    chips.push({
      key: 'price',
      label: 'מחיר',
      valueLabel: priceChipLabel(min, max),
      href: hrefWithoutPrice(current, pathname),
    })
  }
  return chips
}

/** How many chips the strip would show: the badge on the phone's filters link. */
export function activeSearchFilterCount(current: URLSearchParams): number {
  return activeSearchChips(current).length
}

/**
 * The count line. Digits are isolated so a range reads left to right inside
 * the Hebrew sentence. `shown` is how many cards this page holds, so the
 * range is what is on screen and never a promise about a page the engine
 * estimated.
 */
export function searchCountText(
  total: number,
  page: number,
  shown: number,
  pageSize = SEARCH_PAGE_SIZE,
): string {
  if (total <= 0) return 'לא נמצאו מוצרים'
  if (total === 1) return 'נמצא מוצר אחד'
  if (totalSearchPages(total, pageSize) <= 1 || shown >= total) {
    return `נמצאו ⁦${total}⁩ מוצרים`
  }
  const from = searchOffset(page, pageSize) + 1
  const to = searchOffset(page, pageSize) + Math.max(shown, 0)
  if (shown <= 0) return `נמצאו ⁦${total}⁩ מוצרים, אין תוצאות בעמוד הזה`
  return `מציג ⁦${from}–${to}⁩ מתוך ⁦${total}⁩ מוצרים`
}
