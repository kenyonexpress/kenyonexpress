import { describe, expect, it } from 'vitest'
import { type GiftCardCandidate, giftCardProductRefusal } from './product-rule'

const ok: GiftCardCandidate = {
  supplier_id: null,
  platform_percent: 100,
  is_coupon_enabled: false,
  type: 'physical',
  kenyon_price: 200,
  full_price: null,
}

describe('giftCardProductRefusal', () => {
  it('accepts a supplier-less product at 100% sold at par', () => {
    expect(giftCardProductRefusal(ok)).toBeNull()
    expect(giftCardProductRefusal({ ...ok, full_price: 200 })).toBeNull()
    expect(
      giftCardProductRefusal({ ...ok, platform_percent: '100', kenyon_price: '200.00' }),
    ).toBeNull()
  })

  it('refuses a product that has a supplier', () => {
    expect(giftCardProductRefusal({ ...ok, supplier_id: 's1' })).toMatch(/ספק/)
  })

  it('refuses any platform share other than the whole', () => {
    for (const percent of [99, 0, 15, null, '99.5']) {
      expect(giftCardProductRefusal({ ...ok, platform_percent: percent })).toMatch(/100/)
    }
  })

  it('refuses a coupon and a subscription', () => {
    expect(giftCardProductRefusal({ ...ok, is_coupon_enabled: true })).toMatch(/קופון/)
    expect(giftCardProductRefusal({ ...ok, type: 'coupon' })).toMatch(/קופון/)
    expect(giftCardProductRefusal({ ...ok, type: 'recurring' })).toMatch(/מנוי/)
  })

  it('refuses a card with no price, and one sold under or over its full price', () => {
    expect(giftCardProductRefusal({ ...ok, kenyon_price: null })).toMatch(/מחיר/)
    expect(giftCardProductRefusal({ ...ok, kenyon_price: 0 })).toMatch(/מחיר/)
    expect(giftCardProductRefusal({ ...ok, full_price: 250 })).toMatch(/בערכו המלא/)
    expect(giftCardProductRefusal({ ...ok, full_price: 150 })).toMatch(/בערכו המלא/)
  })
})
