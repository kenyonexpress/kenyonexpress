import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { type SupplierProductRow, productEconomics, summarizeCatalogue } from './products'

function row(overrides: Partial<SupplierProductRow> = {}): SupplierProductRow {
  return {
    id: 'p1',
    slug: 'p1',
    nameHe: 'מוצר',
    type: 'physical',
    status: 'active',
    approvalStatus: 'approved',
    faceValueAgorot: agorot(10_000),
    couponPriceAgorot: null,
    platformPercent: 10,
    imageUrl: null,
    ...overrides,
  }
}

describe('productEconomics: physical', () => {
  it('takes platform_percent off the face value and leaves the rest to the supplier', () => {
    const e = productEconomics(row({ faceValueAgorot: agorot(10_000), platformPercent: 10 }))

    expect(e.platformCutAgorot).toBe(1_000)
    expect(e.supplierNetAgorot).toBe(9_000)
    expect(e.collectedAt).toBe('platform')
    expect(e.issue).toBeNull()
  })

  it('uses the per-product percent, not a constant', () => {
    const a = productEconomics(row({ platformPercent: 5 }))
    const b = productEconomics(row({ platformPercent: 22 }))

    expect(a.platformCutAgorot).toBe(500)
    expect(b.platformCutAgorot).toBe(2_200)
  })

  it('rounds through basis points rather than a float multiply', () => {
    // 12.5% of 1999 agorot is 249.875. A float path would drift here; the
    // integer half-up path is what checkout uses.
    const e = productEconomics(row({ faceValueAgorot: agorot(1_999), platformPercent: 12.5 }))

    expect(e.platformCutAgorot).toBe(250)
    expect(e.supplierNetAgorot).toBe(1_749)
    // The two halves must still reconstitute the whole.
    expect((e.platformCutAgorot ?? 0) + (e.supplierNetAgorot ?? 0)).toBe(1_999)
  })

  it('treats a null percent as unconfigured, not as zero commission', () => {
    const e = productEconomics(row({ platformPercent: null }))

    expect(e.issue).toBe('no_platform_percent')
    // The flattering answer -- "you keep 100%" -- is exactly what must not
    // appear, because checkout would not honour it.
    expect(e.supplierNetAgorot).toBeNull()
  })

  it('reports a zero percent as a real zero, not as unconfigured', () => {
    const e = productEconomics(row({ platformPercent: 0 }))

    expect(e.issue).toBeNull()
    expect(e.platformCutAgorot).toBe(0)
    expect(e.supplierNetAgorot).toBe(10_000)
  })
})

describe('productEconomics: coupon', () => {
  it('gives the whole on-site payment to the platform and the balance to the till', () => {
    const e = productEconomics(
      row({ type: 'coupon', faceValueAgorot: agorot(10_000), couponPriceAgorot: agorot(4_000) }),
    )

    expect(e.platformCutAgorot).toBe(4_000)
    expect(e.supplierNetAgorot).toBe(6_000)
    expect(e.collectedAt).toBe('till')
    expect(e.issue).toBeNull()
  })

  it('ignores platform_percent entirely: the discount is the commission', () => {
    const withPercent = productEconomics(
      row({
        type: 'coupon',
        faceValueAgorot: agorot(10_000),
        couponPriceAgorot: agorot(4_000),
        platformPercent: 30,
      }),
    )
    const withoutPercent = productEconomics(
      row({
        type: 'coupon',
        faceValueAgorot: agorot(10_000),
        couponPriceAgorot: agorot(4_000),
        platformPercent: null,
      }),
    )

    expect(withPercent).toEqual(withoutPercent)
  })

  it('refuses a coupon priced above its face value instead of returning a negative', () => {
    const e = productEconomics(
      row({ type: 'coupon', faceValueAgorot: agorot(4_000), couponPriceAgorot: agorot(10_000) }),
    )

    expect(e.issue).toBe('coupon_price_above_face')
    expect(e.supplierNetAgorot).toBeNull()
  })

  it('handles a coupon priced exactly at face value', () => {
    const e = productEconomics(
      row({ type: 'coupon', faceValueAgorot: agorot(4_000), couponPriceAgorot: agorot(4_000) }),
    )

    expect(e.issue).toBeNull()
    expect(e.supplierNetAgorot).toBe(0)
  })
})

describe('productEconomics: bad data', () => {
  it('flags a missing price rather than throwing mid-render', () => {
    expect(productEconomics(row({ faceValueAgorot: agorot(0) })).issue).toBe('no_price')
  })

  it('flags a coupon with no coupon price', () => {
    const e = productEconomics(row({ type: 'coupon', couponPriceAgorot: null }))

    expect(e.issue).toBe('no_price')
  })
})

describe('summarizeCatalogue', () => {
  it('counts totals, active, coupons and rows needing attention', () => {
    const s = summarizeCatalogue([
      row({ id: '1', status: 'active' }),
      row({ id: '2', status: 'draft' }),
      row({ id: '3', type: 'coupon', couponPriceAgorot: agorot(1_000) }),
      row({ id: '4', platformPercent: null }),
    ])

    expect(s).toEqual({ total: 4, active: 3, coupons: 1, needsAttention: 1 })
  })

  it('is empty-safe', () => {
    expect(summarizeCatalogue([])).toEqual({
      total: 0,
      active: 0,
      coupons: 0,
      needsAttention: 0,
    })
  })
})
