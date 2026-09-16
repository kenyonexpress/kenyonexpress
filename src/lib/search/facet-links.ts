import type { FacetDistribution, FacetedSearchParams } from '@/lib/search/faceted'

/**
 * Facet navigation as links, and nothing but links.
 *
 * The site ships no search input (layout/no-search-ui.test.ts), and faceted
 * navigation does not need one: every facet value is a URL, the current
 * selection is the URL the page was rendered from, and choosing or clearing
 * a value is a navigation. That makes the whole thing crawlable, shareable,
 * back-button-safe and free of client state -- the results page stays a
 * server component that reads `searchParams`.
 *
 * Pure functions over URLSearchParams so every rule is a unit test away.
 */

/** URL parameter per facet, the same names `parseFacetedParams` reads. */
export const FACET_PARAM: Record<FacetName, string> = {
  type: 'type',
  category_slug: 'category',
  city: 'city',
  brand: 'brand',
  tags: 'tag',
  in_stock: 'in_stock',
}

export type FacetName = 'type' | 'category_slug' | 'city' | 'brand' | 'tags' | 'in_stock'

/** Section headings, in the order the navigation renders them. */
export const FACET_LABELS: readonly { name: FacetName; label: string }[] = [
  { name: 'type', label: 'סוג' },
  { name: 'category_slug', label: 'קטגוריה' },
  { name: 'city', label: 'עיר' },
  { name: 'brand', label: 'מותג' },
  { name: 'tags', label: 'תגיות' },
  { name: 'in_stock', label: 'זמינות' },
]

/** Values that have a display name of their own; everything else is shown as-is. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  type: { coupon: 'קופונים', physical: 'מוצרים פיזיים', service: 'שירותים', recurring: 'מנויים' },
  in_stock: { true: 'במלאי', false: 'אזל מהמלאי' },
}

export function facetValueLabel(name: FacetName, value: string): string {
  return VALUE_LABELS[name]?.[value] ?? value
}

/** The parameters that survive a facet change: the query and the sort, never the page. */
const CARRIED = ['q', 'sort', 'price_min', 'price_max', 'min', 'max'] as const

/**
 * The href for choosing `value` under `name`, or for clearing it when `value`
 * is the one already selected. One facet holds one value at a time; the
 * offset is dropped because page three of the previous result set means
 * nothing in the new one.
 */
export function facetHref(
  current: URLSearchParams,
  name: FacetName,
  value: string,
  pathname = '/search',
): string {
  const next = new URLSearchParams()
  for (const key of CARRIED) {
    const carried = current.get(key)
    if (carried) next.set(key, carried)
  }
  for (const facet of Object.keys(FACET_PARAM) as FacetName[]) {
    if (facet === name) continue
    const kept = current.get(FACET_PARAM[facet])
    if (kept) next.set(FACET_PARAM[facet], kept)
  }
  const selected = current.get(FACET_PARAM[name]) === value
  if (!selected) next.set(FACET_PARAM[name], value)
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** The href with every facet cleared and the query kept. */
export function clearFacetsHref(current: URLSearchParams, pathname = '/search'): string {
  const next = new URLSearchParams()
  for (const key of CARRIED) {
    const carried = current.get(key)
    if (carried) next.set(key, carried)
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export type FacetOption = {
  value: string
  label: string
  count: number
  selected: boolean
  href: string
}

export type FacetSection = {
  name: FacetName
  label: string
  options: FacetOption[]
}

/** How many values a section shows; the long tail is noise in a sidebar. */
export const MAX_OPTIONS_PER_FACET = 12

/**
 * The navigation model: one section per facet that has at least one value,
 * options ordered by count (then name, for a stable render), the selected
 * value always kept even when it fell outside the top N.
 *
 * A facet whose only value is the one already selected still renders, so
 * the shopper can see what they narrowed by and clear it.
 */
export function buildFacetSections(
  distribution: FacetDistribution,
  current: URLSearchParams,
  pathname = '/search',
): FacetSection[] {
  const sections: FacetSection[] = []
  for (const { name, label } of FACET_LABELS) {
    const bucket = distribution[name]
    if (!bucket) continue
    const selectedValue = current.get(FACET_PARAM[name]) ?? undefined
    const entries = Object.entries(bucket)
      .filter(([value]) => value !== '')
      .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, 'he'))
    let top = entries.slice(0, MAX_OPTIONS_PER_FACET)
    if (selectedValue && !top.some(([value]) => value === selectedValue)) {
      const selectedEntry = entries.find(([value]) => value === selectedValue)
      top = selectedEntry ? [...top, selectedEntry] : [...top, [selectedValue, 0]]
    } else if (selectedValue && entries.length === 0) {
      top = [[selectedValue, 0]]
    }
    if (top.length === 0) continue
    sections.push({
      name,
      label,
      options: top.map(([value, count]) => ({
        value,
        label: facetValueLabel(name, value),
        count,
        selected: value === selectedValue,
        href: facetHref(current, name, value, pathname),
      })),
    })
  }
  return sections
}

/** The facets the URL currently narrows by, for the "active filters" strip. */
export function activeFacetChips(
  current: URLSearchParams,
  pathname = '/search',
): { name: FacetName; label: string; value: string; valueLabel: string; href: string }[] {
  const chips = []
  for (const { name, label } of FACET_LABELS) {
    const value = current.get(FACET_PARAM[name])
    if (!value) continue
    chips.push({
      name,
      label,
      value,
      valueLabel: facetValueLabel(name, value),
      href: facetHref(current, name, value, pathname),
    })
  }
  return chips
}

/**
 * The facet parameters the page passes to the engine, from the page's own
 * `searchParams`. The listing sidebar writes whole-shekel `min`/`max`, the
 * facet API reads `price_min`/`price_max`; both are the catalogue column's
 * own units (numeric shekels, see admin/bulk-price.ts), so the page carries
 * the sidebar's names across as integers and the engine sees one vocabulary.
 */
export function toFacetSearchParams(
  sp: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams()
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  for (const key of ['q', 'type', 'category', 'city', 'brand', 'tag', 'in_stock', 'sort']) {
    const value = first(sp[key])?.trim()
    if (value) params.set(key, value)
  }
  const wholeShekels = (raw: string | undefined) => {
    if (!raw) return undefined
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : undefined
  }
  const min = wholeShekels(first(sp.price_min) ?? first(sp.min))
  const max = wholeShekels(first(sp.price_max) ?? first(sp.max))
  if (min !== undefined) params.set('price_min', min)
  if (max !== undefined) params.set('price_max', max)
  params.set('limit', '48')
  return params
}

/** Whether the URL narrows by anything beyond the query itself. */
export function hasActiveFacets(params: FacetedSearchParams): boolean {
  return Boolean(
    params.type ||
      params.category ||
      params.city ||
      params.brand ||
      params.tag ||
      params.inStock !== undefined ||
      params.priceMin !== undefined ||
      params.priceMax !== undefined,
  )
}
