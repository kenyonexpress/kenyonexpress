/**
 * The two deal chips (rc5 F13). Both default OFF; a chip is on only when its
 * URL parameter is exactly `1`, so a stray value never filters anything.
 *
 *   ?weekend=1        products.weekend_only = true        (migration 284)
 *   ?free_shipping=1  products.shipping_price_agorot = 0  (migration 278)
 */
export interface DealChips {
  weekend: boolean
  freeShipping: boolean
}

const NO_CHIPS: DealChips = { weekend: false, freeShipping: false }

type Params = Record<string, string | string[] | undefined> | URLSearchParams

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return Array.isArray(v) ? v[0] : v
}

export function parseDealChips(params: Params): DealChips {
  return {
    weekend: read(params, 'weekend') === '1',
    freeShipping: read(params, 'free_shipping') === '1',
  }
}

function anyChip(chips: DealChips): boolean {
  return chips.weekend || chips.freeShipping
}

export interface ChipFilterable {
  weekend_only?: boolean | null
  free_shipping?: boolean | null
  shipping_price_agorot?: number | null
}

export function matchesChips(product: ChipFilterable, chips: DealChips): boolean {
  if (chips.weekend && product.weekend_only !== true) return false
  if (chips.freeShipping && product.free_shipping !== true && product.shipping_price_agorot !== 0)
    return false
  return true
}

/** The href that toggles one chip and keeps every other parameter. */
export function toggleChipHref(
  pathname: string,
  current: URLSearchParams,
  key: 'weekend' | 'free_shipping',
): string {
  const next = new URLSearchParams(current)
  if (next.get(key) === '1') next.delete(key)
  else next.set(key, '1')
  next.delete('page')
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
