import { describe, expect, it } from 'vitest'
import {
  type RedeemableVoucher,
  type RedemptionOutcome,
  amountToCollect,
  httpStatusForOutcome,
  toPublicOutcome,
  validateVoucherRedemption,
} from './redemption'

const NOW = new Date('2026-07-24T10:00:00.000Z')

function voucher(overrides: Partial<RedeemableVoucher> = {}): RedeemableVoucher {
  return {
    code: 'ABCDEFGHJK',
    status: 'issued',
    supplierId: 'supplier-1',
    expiresAt: '2026-08-24T00:00:00.000Z',
    faceValueAgorot: 20000, // 200 ILS full price
    couponPriceAgorot: 5000, // 50 ILS paid online
    remainingAmountDueAgorot: 15000, // 150 ILS collected at the counter
    ...overrides,
  }
}

function validate(v: RedeemableVoucher | null, supplierId = 'supplier-1'): RedemptionOutcome {
  return validateVoucherRedemption({ voucher: v, requestingSupplierId: supplierId, now: NOW })
}

describe('validateVoucherRedemption', () => {
  it('redeems a valid issued voucher for its own supplier', () => {
    expect(validate(voucher())).toBe('success')
  })

  it('not_found when the code does not resolve', () => {
    expect(validate(null)).toBe('not_found')
  })

  it('wrong_supplier when another business scans a valid voucher', () => {
    expect(validate(voucher(), 'supplier-2')).toBe('wrong_supplier')
  })

  it('already_redeemed for a redeemed voucher', () => {
    expect(validate(voucher({ status: 'redeemed' }))).toBe('already_redeemed')
  })

  it('cancelled for a cancelled voucher', () => {
    expect(validate(voucher({ status: 'cancelled' }))).toBe('cancelled')
  })

  it('refunded for a refunded voucher', () => {
    expect(validate(voucher({ status: 'refunded' }))).toBe('refunded')
  })

  it('expired for an explicitly expired voucher', () => {
    expect(validate(voucher({ status: 'expired' }))).toBe('expired')
  })

  it('expired when still issued but past the deadline (sweep has not run)', () => {
    expect(validate(voucher({ expiresAt: '2026-07-01T00:00:00.000Z' }))).toBe('expired')
  })

  it('treats exactly at expiry as expired', () => {
    expect(validate(voucher({ expiresAt: NOW.toISOString() }))).toBe('expired')
  })

  it('wrong_supplier takes precedence over an expired status (no cross-supplier leak)', () => {
    // A wrong supplier must not even learn the voucher is expired.
    expect(validate(voucher({ status: 'expired' }), 'supplier-2')).toBe('wrong_supplier')
  })
})

describe('anti-enumeration collapse', () => {
  it('collapses wrong_supplier to not_found for the caller', () => {
    expect(toPublicOutcome('wrong_supplier')).toBe('not_found')
  })

  it('leaves other outcomes honest', () => {
    for (const outcome of [
      'success',
      'already_redeemed',
      'expired',
      'cancelled',
      'refunded',
      'not_found',
    ] as const) {
      expect(toPublicOutcome(outcome)).toBe(outcome)
    }
  })
})

describe('amountToCollect', () => {
  it('returns the balance the business collects at the counter', () => {
    expect(amountToCollect(voucher())).toBe(15000)
  })

  it('throws when the money snapshot violates conservation', () => {
    expect(() => amountToCollect(voucher({ remainingAmountDueAgorot: 999 }))).toThrow(RangeError)
  })

  it('handles a fully-prepaid voucher (nothing to collect)', () => {
    expect(
      amountToCollect(
        voucher({ faceValueAgorot: 5000, couponPriceAgorot: 5000, remainingAmountDueAgorot: 0 }),
      ),
    ).toBe(0)
  })
})

describe('httpStatusForOutcome', () => {
  it('maps outcomes to their HTTP status', () => {
    expect(httpStatusForOutcome('success')).toBe(200)
    expect(httpStatusForOutcome('not_found')).toBe(404)
    expect(httpStatusForOutcome('already_redeemed')).toBe(409)
    expect(httpStatusForOutcome('expired')).toBe(409)
    expect(httpStatusForOutcome('cancelled')).toBe(409)
    expect(httpStatusForOutcome('refunded')).toBe(409)
  })
})
