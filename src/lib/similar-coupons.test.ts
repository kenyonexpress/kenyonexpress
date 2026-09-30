import { describe, expect, it } from 'vitest'
import { type SimilarCouponRow, orderSimilar, toSimilarCoupon } from './similar-coupons'

function row(id: string, extra: Partial<SimilarCouponRow> = {}): SimilarCouponRow {
  return {
    id,
    slug: `slug-${id}`,
    name_he: `קופון ${id}`,
    kenyon_price: 100,
    images: null,
    category_id: 'c1',
    categories: null,
    ...extra,
  }
}

describe('orderSimilar', () => {
  it('puts the same category first and fills from the rest', () => {
    const out = orderSimilar([row('a'), row('b')], [row('c'), row('d'), row('e')], 'x')
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never lists the current product, from either source', () => {
    const out = orderSimilar([row('x'), row('a')], [row('x'), row('b')], 'x')
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('never lists an id twice when the fallback overlaps the category', () => {
    const out = orderSimilar([row('a')], [row('a'), row('b')], 'x')
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('respects the limit', () => {
    const out = orderSimilar([], [row('a'), row('b'), row('c')], 'x', 2)
    expect(out).toHaveLength(2)
  })
})

describe('toSimilarCoupon', () => {
  it('takes the first string image and unwraps the category', () => {
    const c = toSimilarCoupon(
      row('a', {
        images: [null, '', '/images/a.webp', '/images/b.webp'],
        categories: [{ name_he: 'מסעדות', slug: 'restaurants' }],
      }),
      35,
    )
    expect(c.image).toBe('/images/a.webp')
    expect(c.category).toEqual({ name_he: 'מסעדות', slug: 'restaurants' })
    expect(c.paidOnlineIls).toBe(35)
    expect(c.fullPriceIls).toBe(100)
  })

  it('reads a missing price as 0 and a missing image as null, never as a crash', () => {
    const c = toSimilarCoupon(row('a', { kenyon_price: null, images: 'not-an-array' }), null)
    expect(c.fullPriceIls).toBe(0)
    expect(c.image).toBeNull()
    expect(c.paidOnlineIls).toBeNull()
  })
})
