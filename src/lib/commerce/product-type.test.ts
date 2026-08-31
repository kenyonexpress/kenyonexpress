import {
  resolveStorefrontProductType,
  storefrontProductTypeLabel,
} from '@/lib/commerce/product-type'
import { describe, expect, it } from 'vitest'

/**
 * THE PRODUCT PAGE PROMISED TO SHIP A RESTAURANT VOUCHER.
 *
 * MEASURED against production: five active products hold `type = 'physical'`
 * with `is_coupon_enabled = true` -- barbecue, barbecue-2, restaurants-meat-2,
 * restaurants-meat-3, ארוחה-בשרית-זוגית. Everything that bills them treats them
 * as coupons (`cart/pricing.ts`), and so did the product page's own pricing
 * block and its decision to hide the shipping section. The sentence under the
 * supplier's phone number asked `products.type` on its own and answered
 * "המוצר נשלח ומסופק על ידי הספק" -- to a shopper who has to walk into the
 * restaurant to redeem. Measured on a built server at /product/barbecue-2 and
 * /product/restaurants-meat-2.
 *
 * The tag line under the buy button had the same split, printing "מוצר פיזי".
 */

describe('resolveStorefrontProductType', () => {
  it('calls the five measured rows coupons, which is what the bug was', () => {
    // type says physical, is_coupon_enabled says coupon. The opt-in wins, the
    // same way it wins in cart/pricing.ts, which is what actually bills them.
    expect(resolveStorefrontProductType({ type: 'physical', is_coupon_enabled: true })).toBe(
      'coupon',
    )
  })

  it('keeps every type the database can hold', () => {
    expect(resolveStorefrontProductType({ type: 'coupon', is_coupon_enabled: true })).toBe('coupon')
    expect(resolveStorefrontProductType({ type: 'coupon', is_coupon_enabled: false })).toBe(
      'coupon',
    )
    expect(resolveStorefrontProductType({ type: 'physical', is_coupon_enabled: false })).toBe(
      'physical',
    )
    expect(resolveStorefrontProductType({ type: 'service', is_coupon_enabled: false })).toBe(
      'service',
    )
    // Not in the generated enum until 135 lands, and already read by
    // lib/commerce/recurring.ts.
    expect(resolveStorefrontProductType({ type: 'recurring', is_coupon_enabled: false })).toBe(
      'recurring',
    )
  })

  it('promises nothing for a type it does not know', () => {
    // NOT physical. An unrecognised member falling through to the physical
    // branch is the defect cart/pricing.ts documents having shipped once; here
    // it would be a shipping promise for something that may not ship at all.
    expect(resolveStorefrontProductType({ type: 'gift_card', is_coupon_enabled: false })).toBe(
      'service',
    )
    expect(resolveStorefrontProductType({ type: null })).toBe('service')
  })

  it('treats a missing opt-in as no opt-in', () => {
    expect(resolveStorefrontProductType({ type: 'physical' })).toBe('physical')
    expect(resolveStorefrontProductType({ type: 'physical', is_coupon_enabled: null })).toBe(
      'physical',
    )
  })
})

describe('storefrontProductTypeLabel', () => {
  it('labels the resolved type, not the column', () => {
    const measured = { type: 'physical', is_coupon_enabled: true }
    expect(storefrontProductTypeLabel(resolveStorefrontProductType(measured))).toBe('קופון')
  })

  it('has a Hebrew word for each of the four', () => {
    for (const type of ['coupon', 'physical', 'service', 'recurring'] as const) {
      expect(storefrontProductTypeLabel(type)).toMatch(/^[֐-׿ ]+$/)
    }
  })
})
