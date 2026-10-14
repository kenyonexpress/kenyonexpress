import { cityBySlug } from '@/lib/geo/cities'

/**
 * The archive's active filters as removable links (UX14).
 *
 * Pure functions over the same `linkParams` record the two listing pages
 * already build for their pagination links, so the set of facets a chip can
 * name is by construction the set a page link preserves. `sort` is carried
 * but is not a filter: it reorders, it never removes.
 *
 * Every chip is a link to the URL WITHOUT that facet, and "clear all" is the
 * URL with only the sort left. Links and not buttons, like
 * `lib/search/facet-links.ts`: crawlable, shareable, back-button-safe, and the
 * listing page stays a server component.
 */

export type ArchiveLinkParams = Record<string, string | undefined>

export type ActiveFilterChip = {
  /** Which facet this chip removes; `price` covers both `min` and `max`. */
  key: 'type' | 'brand' | 'discount' | 'price' | 'city'
  /** The facet's name, as the shopper reads it. */
  label: string
  /** The selected value, as the shopper reads it. */
  value: string
  /** The archive without this facet, page dropped. */
  href: string
}

/** The keys that narrow the result set. Order is the order the chips render. */
const FILTER_KEYS = ['type', 'brand', 'discount', 'price', 'city'] as const

const TYPE_LABELS: Record<string, string> = {
  coupon: 'קופונים',
  physical: 'מוצרים פיזיים',
}

function hrefWithout(pathname: string, params: ArchiveLinkParams, drop: readonly string[]): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value && !drop.includes(key)) sp.set(key, value)
  }
  const qs = sp.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * A whole-shekel amount for a chip. The filter values are what the shopper
 * typed into the price form, so they are shown back the same way, with the
 * sign after the digits as everywhere else on the site. Not money arithmetic:
 * nothing is computed from them.
 */
function priceLabel(min: string | undefined, max: string | undefined): string {
  const lo = min ? `⁦${min} ₪⁩` : null
  const hi = max ? `⁦${max} ₪⁩` : null
  if (lo && hi) return `${lo} עד ${hi}`
  if (lo) return `מ-${lo}`
  return `עד ${hi}`
}

export function activeFilterChips(pathname: string, params: ArchiveLinkParams): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  for (const key of FILTER_KEYS) {
    if (key === 'price') {
      if (!params.min && !params.max) continue
      chips.push({
        key,
        label: 'מחיר',
        value: priceLabel(params.min, params.max),
        href: hrefWithout(pathname, params, ['min', 'max']),
      })
      continue
    }
    const raw = params[key]
    if (!raw) continue
    if (key === 'type') {
      chips.push({
        key,
        label: 'סוג',
        value: TYPE_LABELS[raw] ?? raw,
        href: hrefWithout(pathname, params, [key]),
      })
    } else if (key === 'brand') {
      chips.push({ key, label: 'מותג', value: raw, href: hrefWithout(pathname, params, [key]) })
    } else if (key === 'discount') {
      chips.push({
        key,
        label: 'הנחה',
        value: `לפחות ⁦${raw}%⁩`,
        href: hrefWithout(pathname, params, [key]),
      })
    } else {
      chips.push({
        key,
        label: 'עיר',
        value: cityBySlug(raw)?.name ?? raw,
        href: hrefWithout(pathname, params, [key]),
      })
    }
  }
  return chips
}

/** How many facets narrow this page. The price range counts once. */
export function activeFilterCount(params: ArchiveLinkParams): number {
  return activeFilterChips('/', params).length
}

/** The archive with every facet cleared and only the sort kept. */
export function clearFiltersHref(pathname: string, params: ArchiveLinkParams): string {
  return hrefWithout(pathname, params, ['type', 'brand', 'discount', 'min', 'max', 'city'])
}
