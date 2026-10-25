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
  weekend_only?: boolean | null
  shipping_price?: number | null
  shipping_price_agorot?: number | null
  price?: number | null
  price_agorot?: number | null
}

export function matchesCategoryFilters(
  product: CategoryFilterable,
  filters: CategoryFilterChips,
): boolean {
  if (filters.weekend && product.weekend_only !== true) return false

  if (filters.freeShipping) {
    const shipPrice = product.shipping_price ?? (product.shipping_price_agorot ?? 0) / 100
    if (shipPrice !== 0) return false
  }

  const priceShekels = product.price ?? (product.price_agorot ?? 0) / 100
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
