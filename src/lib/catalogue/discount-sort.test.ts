import { describe, expect, it } from 'vitest'
import { discountBp, sortByDiscountDesc } from './discount-sort'

describe('discountBp', () => {
  it('is the saving as basis points of the full price', () => {
    expect(discountBp(1000, 800)).toBe(2000)
    expect(discountBp(500, 250)).toBe(5000)
    expect(discountBp('195', '99')).toBe(4923)
  })

  it('rounds down and stays an integer', () => {
    // 1/3 off is 3333.33 bp.
    expect(discountBp(300, 200)).toBe(3333)
    expect(Number.isInteger(discountBp(19.99, 13.37))).toBe(true)
  })

  it('is zero when there is no real discount or a price is missing', () => {
    expect(discountBp(100, 100)).toBe(0)
    expect(discountBp(100, 120)).toBe(0)
    expect(discountBp(null, 100)).toBe(0)
    expect(discountBp(100, null)).toBe(0)
    expect(discountBp(0, 0)).toBe(0)
    expect(discountBp('abc', 10)).toBe(0)
  })
})

describe('sortByDiscountDesc', () => {
  const rows = [
    { id: 'none', full_price: null, kenyon_price: 50 },
    { id: 'quarter', full_price: 400, kenyon_price: 300 },
    { id: 'half', full_price: 500, kenyon_price: 250 },
    { id: 'quarter-older', full_price: 800, kenyon_price: 600 },
  ]

  it('puts the biggest discount first and undiscounted products last', () => {
    expect(sortByDiscountDesc(rows).map((r) => r.id)).toEqual([
      'half',
      'quarter',
      'quarter-older',
      'none',
    ])
  })

  it('keeps the incoming order between equal discounts', () => {
    const reversed = [...rows].reverse()
    const ids = sortByDiscountDesc(reversed).map((r) => r.id)
    expect(ids.indexOf('quarter-older')).toBeLessThan(ids.indexOf('quarter'))
  })

  it('does not mutate its input', () => {
    const copy = [...rows]
    sortByDiscountDesc(rows)
    expect(rows).toEqual(copy)
  })
})
