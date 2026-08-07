import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { describe, expect, it } from 'vitest'
import { buildOgCard } from './product-card'

/**
 * Everything decidable about the card is asserted here rather than looked at,
 * because an OG image is the one surface whoever ships it never sees: it is
 * rendered for the RECIPIENT of a share.
 */

const SELLABLE: CouponOffer = {
  sellable: true,
  fullPriceIls: 200,
  paidOnlineIls: 80,
  balanceAtBusinessIls: 120,
  discountPercent: 60,
  validUntil: null,
  expiryDays: null,
}

const BASE = { name: 'ארוחה זוגית', supplierName: 'מסעדת הים', priceIls: 200 }

describe('the price on the card', () => {
  it('is what the site charges, not the sticker price', () => {
    const card = buildOgCard({ ...BASE, offer: SELLABLE })
    expect(card.price).toBe('₪80')
    expect(card.wasPrice).toBe('₪200')
  })

  it('labels it, so 80 is never read as the total', () => {
    const card = buildOgCard({ ...BASE, offer: SELLABLE })
    expect(card.priceLabel).toBe('שולם באתר')
    expect(card.balance).toBe('+ ₪120 בבית העסק')
  })

  it('drops the balance line when nothing is due at the counter', () => {
    const card = buildOgCard({
      ...BASE,
      offer: { ...SELLABLE, balanceAtBusinessIls: 0, paidOnlineIls: 200, discountPercent: 0 },
    })
    expect(card.balance).toBeNull()
  })

  it('shows no strike-through when there is no real saving', () => {
    // A strike-through on an equal number claims a saving that does not exist —
    // the same rule the Merchant feed applies to `g:sale_price`.
    const card = buildOgCard({
      ...BASE,
      offer: { ...SELLABLE, fullPriceIls: 80, paidOnlineIls: 80, discountPercent: 0 },
    })
    expect(card.wasPrice).toBeNull()
    expect(card.discountBadge).toBeNull()
  })

  it('quotes the plain price for a product that is not a coupon', () => {
    const card = buildOgCard({ ...BASE, offer: null })
    expect(card.price).toBe('₪200')
    expect(card.priceLabel).toBeNull()
  })

  it('says nothing about money for a coupon the admin never priced', () => {
    const card = buildOgCard({
      ...BASE,
      offer: { sellable: false, reason: 'missing-price', fullPriceIls: 200, validUntil: null },
    })
    expect(card.price).toBeNull()
    expect(card.wasPrice).toBeNull()
    expect(card.discountBadge).toBeNull()
    // The name and the business still render: the card is not blank.
    expect(card.title).toBe('ארוחה זוגית')
    expect(card.supplier).toBe('מסעדת הים')
  })

  it('says nothing about money for a product with no price at all', () => {
    expect(buildOgCard({ ...BASE, priceIls: null, offer: null }).price).toBeNull()
  })
})

describe('the title, which Satori cannot clip for us', () => {
  it('leaves a normal name alone', () => {
    expect(buildOgCard({ ...BASE, offer: null }).title).toBe('ארוחה זוגית')
  })

  it('clips a long one, because overflow is drawn past the card and cropped', () => {
    // Satori has no text-overflow and no line clamp: text that does not fit is
    // painted outside the 1200x630 boundary with nothing to indicate it.
    const long = 'ארוחה '.repeat(30)
    const card = buildOgCard({ ...BASE, name: long, offer: null })
    expect(card.title.length).toBeLessThanOrEqual(61)
    expect(card.title.endsWith('…')).toBe(true)
  })

  it('clips on a word boundary when one is near the cut', () => {
    const name = `${'א'.repeat(50)} ${'ב'.repeat(20)}`
    expect(buildOgCard({ ...BASE, name, offer: null }).title).toBe(`${'א'.repeat(50)}…`)
  })

  it('hard-cuts a single long token rather than returning nothing', () => {
    const card = buildOgCard({ ...BASE, name: 'א'.repeat(200), offer: null })
    expect(card.title).toBe(`${'א'.repeat(60)}…`)
  })

  it('trims, so a stray newline in a column does not become a blank line', () => {
    expect(buildOgCard({ ...BASE, name: '  ארוחה  ', offer: null }).title).toBe('ארוחה')
  })
})

describe('the supplier line', () => {
  it('is null rather than empty when the business has no name', () => {
    // Satori renders an empty flex child as a gap, not as nothing.
    expect(buildOgCard({ ...BASE, supplierName: '  ', offer: null }).supplier).toBeNull()
    expect(buildOgCard({ ...BASE, supplierName: null, offer: null }).supplier).toBeNull()
  })
})
