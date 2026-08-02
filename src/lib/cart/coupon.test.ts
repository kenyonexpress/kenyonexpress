import { describe, expect, it } from 'vitest'
import { type CouponRecord, evaluateCoupon, normalizeCouponCode } from './coupon'

const NOW = new Date('2026-07-29T00:00:00Z')

function coupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'c1',
    code: 'SAVE10',
    discount_type: 'fixed',
    discount_value: 10,
    min_purchase: null,
    expires_at: null,
    is_active: true,
    max_uses: null,
    used_count: 0,
    product_id: null,
    ...overrides,
  }
}

const cart = (payableAgorot: number, productIds: string[] = ['p1']) => ({
  payableAgorot,
  productIds,
})

describe('normalizeCouponCode', () => {
  it('upper-cases and strips the whitespace that rides along with a paste', () => {
    expect(normalizeCouponCode('  save 10 ')).toBe('SAVE10')
    expect(normalizeCouponCode('save10')).toBe('SAVE10')
  })

  it('returns an empty string for anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}]) expect(normalizeCouponCode(value)).toBe('')
  })
})

describe('evaluateCoupon', () => {
  it('turns a fixed shekel discount into agorot', () => {
    const result = evaluateCoupon(coupon({ discount_value: 10 }), cart(5000), NOW)
    expect(result).toMatchObject({ ok: true, discountAgorot: 1000 })
  })

  it('computes a percentage against the payable amount', () => {
    const result = evaluateCoupon(
      coupon({ discount_type: 'percent', discount_value: 15 }),
      cart(5000),
      NOW,
    )
    expect(result).toMatchObject({ ok: true, discountAgorot: 750 })
  })

  it('rounds a percentage to whole agorot', () => {
    // 33% of 1001 agorot is 330.33; money has no third of an agora.
    const result = evaluateCoupon(
      coupon({ discount_type: 'percent', discount_value: 33 }),
      cart(1001),
      NOW,
    )
    expect(result.ok && Number.isInteger(result.discountAgorot)).toBe(true)
    expect(result.ok && result.discountAgorot).toBe(330)
  })

  it('caps a discount at the payable amount instead of paying the shopper', () => {
    // A ₪50 code on a ₪30 cart is worth ₪30. The extra ₪20 would be a payout.
    const result = evaluateCoupon(coupon({ discount_value: 50 }), cart(3000), NOW)
    expect(result).toMatchObject({ ok: true, discountAgorot: 3000 })
  })

  it('never returns a negative discount', () => {
    const result = evaluateCoupon(coupon({ discount_value: -20 }), cart(3000), NOW)
    expect(result.ok).toBe(false)
  })

  it.each([
    [{ is_active: false }, 'inactive'],
    [{ expires_at: '2026-07-28T23:59:00Z' }, 'expired'],
    [{ expires_at: 'not-a-date' }, 'expired'],
    [{ max_uses: 5, used_count: 5 }, 'exhausted'],
    [{ max_uses: 5, used_count: 9 }, 'exhausted'],
    [{ min_purchase: 100 }, 'below-minimum'],
    [{ product_id: 'other' }, 'not-in-cart'],
  ])('rejects %o as %s', (overrides, reason) => {
    const result = evaluateCoupon(coupon(overrides), cart(5000), NOW)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe(reason)
  })

  it('rejects an unknown code', () => {
    const result = evaluateCoupon(null, cart(5000), NOW)
    expect(!result.ok && result.reason).toBe('unknown')
  })

  it('accepts a coupon whose expiry is still ahead', () => {
    const result = evaluateCoupon(coupon({ expires_at: '2026-07-30T00:00:00Z' }), cart(5000), NOW)
    expect(result.ok).toBe(true)
  })

  it('accepts a product-scoped code when that product is in the cart', () => {
    const result = evaluateCoupon(coupon({ product_id: 'p2' }), cart(5000, ['p1', 'p2']), NOW)
    expect(result.ok).toBe(true)
  })

  it('honours a minimum that is exactly met', () => {
    const result = evaluateCoupon(coupon({ min_purchase: 50 }), cart(5000), NOW)
    expect(result.ok).toBe(true)
  })

  it('refuses to discount a cart with nothing payable on the site', () => {
    // A cart of coupon products whose whole balance is due at the business has
    // no on-site amount to reduce. Discounting it would move money out of the
    // supplier's till, which is a transfer and not a discount.
    const result = evaluateCoupon(coupon(), cart(0), NOW)
    expect(!result.ok && result.reason).toBe('nothing-to-discount')
  })

  it('carries a Hebrew message on every rejection', () => {
    for (const overrides of [
      { is_active: false },
      { expires_at: '2020-01-01T00:00:00Z' },
      { max_uses: 1, used_count: 1 },
      { min_purchase: 999 },
      { product_id: 'other' },
    ]) {
      const result = evaluateCoupon(coupon(overrides), cart(5000), NOW)
      expect(!result.ok && /[֐-׿]/.test(result.message)).toBe(true)
    }
  })

  it('labels the two discount shapes differently', () => {
    const fixed = evaluateCoupon(coupon({ discount_value: 10 }), cart(5000), NOW)
    const percent = evaluateCoupon(
      coupon({ discount_type: 'percent', discount_value: 10 }),
      cart(5000),
      NOW,
    )
    expect(fixed.ok && fixed.label).toBe('₪10 הנחה')
    expect(percent.ok && percent.label).toBe('10% הנחה')
  })

  // Everything in this block was measured against the arithmetic that shipped
  // before money.ts was wired in. Each one returned `ok: true`.
  describe('rows the raw arithmetic accepted and money.ts does not', () => {
    it('refuses a percentage above 100 instead of discounting the whole cart', () => {
      // Measured before the fix: { ok: true, discountAgorot: 5000 } on a 5000
      // agorot cart. One extra digit in the admin form gave the cart away, and
      // the cap could not catch it because "the whole cart" is what the cap is.
      const result = evaluateCoupon(
        coupon({ discount_type: 'percent', discount_value: 150 }),
        cart(5000),
        NOW,
      )
      expect(result.ok).toBe(false)
      expect(!result.ok && result.reason).toBe('invalid')
    })

    it('refuses a discount_value that is not a number', () => {
      // Measured before the fix: { ok: true, discountAgorot: NaN }. The
      // zero-check let it through because `NaN <= 0` is false, and the NaN went
      // on into the cart total.
      const result = evaluateCoupon(coupon({ discount_value: Number.NaN }), cart(5000), NOW)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.reason).toBe('invalid')
    })

    it('refuses a shekel amount finer than an agora', () => {
      // Measured before the fix: 10.005 became 1001 agorot, silently rounded.
      const result = evaluateCoupon(coupon({ discount_value: 10.005 }), cart(500000), NOW)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.reason).toBe('invalid')
    })

    it('refuses a minimum finer than an agora rather than ignoring it', () => {
      // Measured before the fix: the minimum was rounded away and the coupon
      // applied. A threshold nobody can state is not a threshold.
      const result = evaluateCoupon(coupon({ min_purchase: 50.004 }), cart(5000), NOW)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.reason).toBe('invalid')
    })

    it('refuses a negative percentage', () => {
      const result = evaluateCoupon(
        coupon({ discount_type: 'percent', discount_value: -5 }),
        cart(5000),
        NOW,
      )
      expect(result.ok).toBe(false)
    })

    it('carries a Hebrew message on the invalid rejection too', () => {
      const result = evaluateCoupon(
        coupon({ discount_type: 'percent', discount_value: 150 }),
        cart(5000),
        NOW,
      )
      expect(!result.ok && /[֐-׿]/.test(result.message)).toBe(true)
    })

    it('still accepts the boundary: exactly 100 percent', () => {
      // 100 is legal and means "free". Only above it is a typo.
      const result = evaluateCoupon(
        coupon({ discount_type: 'percent', discount_value: 100 }),
        cart(5000),
        NOW,
      )
      expect(result).toMatchObject({ ok: true, discountAgorot: 5000 })
    })

    it('still accepts an ordinary two-decimal shekel amount', () => {
      const result = evaluateCoupon(coupon({ discount_value: 10.05 }), cart(500000), NOW)
      expect(result).toMatchObject({ ok: true, discountAgorot: 1005 })
    })
  })

  it('treats an unrecognised discount_type as a fixed shekel amount', () => {
    // The column is free text. Reading an unknown value as a percentage would
    // turn a ₪10 code into a 10% one silently, which is a pricing bug on every
    // cart over ₪100.
    const result = evaluateCoupon(
      coupon({ discount_type: 'something-else', discount_value: 10 }),
      cart(50000),
      NOW,
    )
    expect(result.ok && result.discountAgorot).toBe(1000)
  })
})
