import { describe, expect, it } from 'vitest'
import { type CouponOfferInput, buildCouponOffer, shekelsFromIls } from './coupon-offer'

const NOW = new Date('2026-07-27T00:00:00Z')

// The live "קופון טסט" page: מחיר רגיל ⁦100, ₪⁩ מחיר בקניון ⁦50 ₪⁩.
const base: CouponOfferInput = {
  fullPriceIls: 100,
  couponPriceIls: 50,
  validUntil: null,
  expiryDays: null,
  now: NOW,
}

describe('buildCouponOffer follows the absolute-price model', () => {
  it('charges the admin-set absolute price online, not a percent of the sticker', () => {
    const offer = buildCouponOffer(base)
    expect(offer).toMatchObject({
      sellable: true,
      fullPriceIls: 100,
      paidOnlineIls: 50,
      balanceAtBusinessIls: 50,
      discountPercent: 50,
    })
    // The regression this module exists to prevent: the page used to render
    // price * 0.1 while the cart billed coupon_price_ils.
    expect(offer.sellable && offer.paidOnlineIls).not.toBe(10)
  })

  it('derives the balance from the sticker price, never from a percent', () => {
    const offer = buildCouponOffer({ ...base, fullPriceIls: 400, couponPriceIls: 40 })
    expect(offer).toMatchObject({
      paidOnlineIls: 40,
      balanceAtBusinessIls: 360,
      discountPercent: 90,
    })
  })

  it('handles a coupon priced at the full sticker: nothing left at the business', () => {
    const offer = buildCouponOffer({ ...base, couponPriceIls: 100 })
    expect(offer).toMatchObject({ paidOnlineIls: 100, balanceAtBusinessIls: 0, discountPercent: 0 })
  })

  it('clamps a price above the sticker so the balance never renders negative', () => {
    // products_coupon_price_within_price was added NOT VALID, so rows that
    // predate it can still violate it. A negative "balance at business" would
    // read as the shop owing the customer money.
    const offer = buildCouponOffer({ ...base, couponPriceIls: 150 })
    expect(offer).toMatchObject({ paidOnlineIls: 100, balanceAtBusinessIls: 0 })
  })
})

describe('buildCouponOffer refuses to sell what it cannot price', () => {
  it('is unsellable when the admin has not set a coupon price', () => {
    for (const missing of [null, undefined, 0, -5]) {
      const offer = buildCouponOffer({ ...base, couponPriceIls: missing })
      expect(offer).toMatchObject({ sellable: false, reason: 'missing-price' })
    }
  })

  it('is unsellable once the offer deadline has passed', () => {
    const offer = buildCouponOffer({ ...base, validUntil: '2026-07-26T23:59:00Z' })
    expect(offer).toMatchObject({ sellable: false, reason: 'expired' })
  })

  it('reports expiry ahead of a missing price, because that is the useful reason', () => {
    const offer = buildCouponOffer({
      ...base,
      couponPriceIls: null,
      validUntil: '2020-01-01T00:00:00Z',
    })
    expect(offer).toMatchObject({ sellable: false, reason: 'expired' })
  })

  it('stays sellable right up to the deadline', () => {
    const offer = buildCouponOffer({ ...base, validUntil: '2026-07-27T00:00:01Z' })
    expect(offer.sellable).toBe(true)
  })

  it('ignores an unparseable deadline rather than blocking the sale on it', () => {
    const offer = buildCouponOffer({ ...base, validUntil: 'not a date' })
    expect(offer).toMatchObject({ sellable: true, validUntil: null })
  })
})

describe('shekelsFromIls', () => {
  it('always shows two decimals so prices align in a column', () => {
    expect(shekelsFromIls(50)).toBe('⁦50.00 ₪⁩')
    expect(shekelsFromIls(1234.5)).toBe('⁦1,234.50 ₪⁩')
  })
})
