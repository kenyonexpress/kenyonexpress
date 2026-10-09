import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { describe, expect, it } from 'vitest'
import { buildShareMessage } from './message'

const SELLABLE: CouponOffer = {
  sellable: true,
  fullPriceIls: 200,
  paidOnlineIls: 80,
  balanceAtBusinessIls: 120,
  discountPercent: 60,
  validUntil: null,
  expiryDays: null,
}

describe('buildShareMessage', () => {
  it('quotes what the site charges for a coupon, not the sticker price', () => {
    // The bug: the button interpolated `shekels(price)`, and for a coupon
    // `price` is `products.price_ils` — what the goods cost AT THE BUSINESS.
    // A customer sharing an ⁦80 ₪⁩ coupon sent their friend "⁦200 ₪⁩", and the friend
    // landed on a page quoting ⁦80 ₪⁩.
    const message = buildShareMessage({ name: 'ארוחה זוגית', priceIls: 200, offer: SELLABLE })
    expect(message).toContain('⁦80 ₪⁩')
    expect(message).not.toContain('⁦200 ₪⁩')
  })

  it('states the balance due at the business alongside it', () => {
    // "⁦80 ₪⁩" alone sends someone to a counter believing they owe nothing.
    expect(buildShareMessage({ name: 'x', priceIls: 200, offer: SELLABLE })).toContain(
      '⁦120 ₪⁩ בבית העסק',
    )
  })

  it('says nothing about a balance when there is none', () => {
    const offer: CouponOffer = { ...SELLABLE, balanceAtBusinessIls: 0, paidOnlineIls: 200 }
    expect(buildShareMessage({ name: 'x', priceIls: 200, offer })).not.toContain('בבית העסק')
  })

  it('mentions the saving only when there is one', () => {
    expect(buildShareMessage({ name: 'x', priceIls: 200, offer: SELLABLE })).toContain('60% הנחה')
    const flat: CouponOffer = { ...SELLABLE, discountPercent: 0 }
    expect(buildShareMessage({ name: 'x', priceIls: 200, offer: flat })).not.toContain('הנחה')
  })

  it('quotes no price at all for a coupon the admin never priced', () => {
    // The product page refuses to quote it too. Falling back to the sticker
    // price here would be exactly the wrong number, stated confidently.
    const unsellable: CouponOffer = {
      sellable: false,
      reason: 'missing-price',
      fullPriceIls: 200,
      validUntil: null,
    }
    const message = buildShareMessage({ name: 'ארוחה', priceIls: 200, offer: unsellable })
    expect(message).toBe('מצאתי משהו שווה ב-KenyonExpress: ארוחה')
    expect(message).not.toContain('₪')
  })

  it('quotes the plain price for a product that is not a coupon', () => {
    expect(buildShareMessage({ name: 'אוזניות', priceIls: 399, offer: null })).toContain('⁦399 ₪⁩')
  })

  it('drops the agorot when a price has none, as the page does', () => {
    expect(buildShareMessage({ name: 'x', priceIls: 399, offer: null })).toContain('⁦399 ₪⁩')
    expect(buildShareMessage({ name: 'x', priceIls: 399.5, offer: null })).toContain('⁦399.5 ₪⁩')
  })

  it('carries no URL: the channel appends its own', () => {
    // WhatsApp adds it on a new line and Facebook takes it as `u`. One baked in
    // here would be sent twice.
    expect(buildShareMessage({ name: 'x', priceIls: 10, offer: null })).not.toContain('http')
  })
})
