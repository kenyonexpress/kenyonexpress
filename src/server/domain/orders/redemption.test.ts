import { issueCouponCode } from '@/lib/checkout/coupon-issue'
import { describe, expect, it } from 'vitest'
import {
  type RedeemableCoupon,
  isValidShortCode,
  validateRedemption,
  verifyQrPayload,
} from './redemption'

const NOW = new Date('2026-07-21T10:00:00.000Z')

function coupon(overrides: Partial<RedeemableCoupon> = {}): RedeemableCoupon {
  return {
    code: '12345678',
    status: 'issued',
    supplierId: 'supplier-1',
    expiresAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('short code format', () => {
  it('accepts exactly 8 digits', () => {
    expect(isValidShortCode('00112233')).toBe(true)
    expect(isValidShortCode('1234567')).toBe(false)
    expect(isValidShortCode('123456789')).toBe(false)
    expect(isValidShortCode('1234567a')).toBe(false)
  })
})

describe('verifyQrPayload', () => {
  it('round-trips a payload produced by issueCouponCode', () => {
    const issued = issueCouponCode({
      orderItemId: 'item-1',
      userId: 'user-1',
      expiryDays: 30,
      now: NOW,
    })
    const parts = verifyQrPayload(issued.qrPayload)
    expect(parts).not.toBeNull()
    expect(parts?.code).toBe(issued.code)
    expect(parts?.orderItemId).toBe('item-1')
    expect(parts?.userId).toBe('user-1')
    expect(parts?.expiresUnix).toBe(Math.floor(issued.expiresAt.getTime() / 1000))
  })

  it('rejects tampered payloads', () => {
    const issued = issueCouponCode({
      orderItemId: 'item-1',
      userId: 'user-1',
      expiryDays: 30,
      now: NOW,
    })
    const [prefix, code, itemId, expires, userId, digest] = issued.qrPayload.split('|')
    const flippedCode = code === '00000000' ? '00000001' : '00000000'
    expect(
      verifyQrPayload([prefix, flippedCode, itemId, expires, userId, digest].join('|')),
    ).toBeNull()
    expect(
      verifyQrPayload([prefix, code, itemId, expires, 'other-user', digest].join('|')),
    ).toBeNull()
    expect(verifyQrPayload(`${issued.qrPayload}x`)).toBeNull()
    expect(verifyQrPayload('KE|12345678|item|123')).toBeNull()
    expect(verifyQrPayload('')).toBeNull()
  })
})

describe('validateRedemption', () => {
  it('accepts a live coupon scanned by its own supplier', () => {
    expect(
      validateRedemption({ coupon: coupon(), requestingSupplierId: 'supplier-1', now: NOW }),
    ).toBe('success')
  })

  it('rejects unknown codes', () => {
    expect(validateRedemption({ coupon: null, requestingSupplierId: 'supplier-1', now: NOW })).toBe(
      'not_found',
    )
  })

  it('rejects a scan by another supplier before leaking status', () => {
    expect(
      validateRedemption({
        coupon: coupon({ status: 'used' }),
        requestingSupplierId: 'supplier-2',
        now: NOW,
      }),
    ).toBe('wrong_supplier')
  })

  it('enforces single use', () => {
    expect(
      validateRedemption({
        coupon: coupon({ status: 'used' }),
        requestingSupplierId: 'supplier-1',
        now: NOW,
      }),
    ).toBe('already_used')
  })

  it('rejects refunded coupons', () => {
    expect(
      validateRedemption({
        coupon: coupon({ status: 'refunded' }),
        requestingSupplierId: 'supplier-1',
        now: NOW,
      }),
    ).toBe('refunded')
  })

  it('rejects expiry by status and by clock, boundary inclusive', () => {
    expect(
      validateRedemption({
        coupon: coupon({ status: 'expired' }),
        requestingSupplierId: 'supplier-1',
        now: NOW,
      }),
    ).toBe('expired')
    expect(
      validateRedemption({
        coupon: coupon({ expiresAt: NOW.toISOString() }),
        requestingSupplierId: 'supplier-1',
        now: NOW,
      }),
    ).toBe('expired')
    expect(
      validateRedemption({
        coupon: coupon({ expiresAt: new Date(NOW.getTime() + 1000).toISOString() }),
        requestingSupplierId: 'supplier-1',
        now: NOW,
      }),
    ).toBe('success')
  })
})
