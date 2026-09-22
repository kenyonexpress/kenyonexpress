import { describe, expect, it } from 'vitest'
import { couponImpact } from './coupon-impact'

describe('couponImpact', () => {
  it('attributes on-site revenue only to issued and redeemed vouchers', () => {
    const impact = couponImpact([
      { productId: 'p1', productName: 'ספא', status: 'issued', couponPriceAgorot: 4000 },
      { productId: 'p1', productName: 'ספא', status: 'redeemed', couponPriceAgorot: 4000 },
      { productId: 'p1', productName: 'ספא', status: 'refunded', couponPriceAgorot: 4000 },
      { productId: 'p2', productName: 'מלון', status: 'cancelled', couponPriceAgorot: 9000 },
    ])
    expect(impact.issued).toBe(1)
    expect(impact.redeemed).toBe(1)
    expect(impact.refunded).toBe(1)
    expect(impact.platformRevenueAgorot).toBe(8000)
    expect(impact.products[0]?.productId).toBe('p1')
    expect(impact.products.find((row) => row.productId === 'p2')?.platformRevenueAgorot).toBe(0)
  })

  it('returns empty totals for no rows', () => {
    expect(couponImpact([])).toEqual({
      products: [],
      issued: 0,
      redeemed: 0,
      refunded: 0,
      platformRevenueAgorot: 0,
    })
  })
})
