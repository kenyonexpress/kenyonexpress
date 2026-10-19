import { describe, expect, it } from 'vitest'
import { matchesChips, parseDealChips, toggleChipHref } from './deal-chips'

describe('parseDealChips', () => {
  it('is off unless the value is exactly 1', () => {
    expect(parseDealChips({})).toEqual({ weekend: false, freeShipping: false })
    expect(parseDealChips({ weekend: 'true', free_shipping: '1' })).toEqual({
      weekend: false,
      freeShipping: true,
    })
    expect(parseDealChips(new URLSearchParams('weekend=1'))).toEqual({
      weekend: true,
      freeShipping: false,
    })
  })
})

describe('matchesChips', () => {
  it('filters on the stored columns only when a chip is on', () => {
    const p = { weekend_only: false, shipping_price_agorot: 2990 }
    expect(matchesChips(p, { weekend: false, freeShipping: false })).toBe(true)
    expect(matchesChips(p, { weekend: true, freeShipping: false })).toBe(false)
    expect(matchesChips({ shipping_price_agorot: 0 }, { weekend: false, freeShipping: true })).toBe(
      true,
    )
    // NULL shipping is "not shipped", which is not free shipping.
    expect(
      matchesChips({ shipping_price_agorot: null }, { weekend: false, freeShipping: true }),
    ).toBe(false)
  })
})

describe('toggleChipHref', () => {
  it('toggles one chip, keeps the rest, and resets paging', () => {
    expect(toggleChipHref('/products', new URLSearchParams('sort=price&page=3'), 'weekend')).toBe(
      '/products?sort=price&weekend=1',
    )
    expect(toggleChipHref('/c/haifa', new URLSearchParams('weekend=1'), 'weekend')).toBe('/c/haifa')
  })
})
