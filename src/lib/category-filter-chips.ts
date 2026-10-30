import { opensOnWeekend } from '@/lib/opening-hours'

/**
 * F63: Category filter chips (weekend/free shipping/price brackets).
 * Multi-select chips encoded as ?filters=weekend,free_shipping,price_100,price_500
 */

export interface CategoryFilterChips {
  weekend: boolean
  freeShipping: boolean
  price100: boolean
  price500: boolean
}

export const NO_FILTERS: CategoryFilterChips = {
  weekend: false,
  freeShipping: false,
  price100: false,
  price500: false,
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return Array.isArray(v) ? v[0] : v
}

export function parseCategoryFilterChips(params: Params): CategoryFilterChips {
  const filtersParam = read(params, 'filters')
  if (!filtersParam) return NO_FILTERS

  const active = new Set(filtersParam.split(','))
  return {
    weekend: active.has('weekend'),
    freeShipping: active.has('free_shipping'),
    price100: active.has('price_100'),
    price500: active.has('price_500'),
  }
}

export function anyFilter(filters: CategoryFilterChips): boolean {
  return filters.weekend || filters.freeShipping || filters.price100 || filters.price500
}

export interface CategoryFilterable {
  /** products.opening_hours jsonb (migration 320): weekend = fri or sat open */
  opening_hours?: unknown
  /** products.weekend_only (migration 284): deal valid on weekends only */
  weekend_only?: boolean | null
  supplier?: { open_weekends?: boolean | null } | null
  shipping_price_agorot?: number | null
  /** kenyon_price is in shekels, not agorot */
  kenyon_price?: number | null
}

export function matchesCategoryFilters(
  product: CategoryFilterable,
  filters: CategoryFilterChips,
): boolean {
  if (
    filters.weekend &&
    !opensOnWeekend(product.opening_hours) &&
    product.weekend_only !== true &&
    product.supplier?.open_weekends !== true
  )
    return false

  if (filters.freeShipping) {
    const shipPriceAgorot = product.shipping_price_agorot ?? null
    if (shipPriceAgorot !== 0) return false
  }

  // kenyon_price is already in shekels
  const priceShekels = product.kenyon_price ?? 0
  if (filters.price100 && priceShekels > 100) return false
  if (filters.price500 && priceShekels > 500) return false

  return true
}

type FilterKey = 'weekend' | 'free_shipping' | 'price_100' | 'price_500'

/** The href that toggles one filter chip and keeps every other parameter. */
export function toggleFilterChipHref(
  pathname: string,
  current: URLSearchParams,
  key: FilterKey,
): string {
  const next = new URLSearchParams(current)
  const filtersParam = next.get('filters') ?? ''
  const active = new Set(filtersParam.split(',').filter(Boolean))

  if (active.has(key)) {
    active.delete(key)
  } else {
    active.add(key)
  }

  if (active.size === 0) {
    next.delete('filters')
  } else {
    next.set('filters', Array.from(active).sort().join(','))
  }

  next.delete('page')
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
