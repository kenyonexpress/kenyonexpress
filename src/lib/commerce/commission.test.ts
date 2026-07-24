import { describe, expect, it } from 'vitest'
import { type CommissionInput, calculateCommission } from './commission'
import { agorot } from './money'

// Final rules: the coupon on-site charge is the ABSOLUTE admin price (40₪
// here on a 400₪ face), never a percent.
const coupon = {
  id: 'coupon-1',
  productType: 'coupon' as const,
  unitPrice: agorot(40_000),
  quantity: 1,
  couponPriceUnit: agorot(4_000),
  cashbackPercent: 5,
}

const physical = {
  id: 'physical-1',
  productType: 'physical' as const,
  unitPrice: agorot(10_000),
  quantity: 1,
  platformPercent: 10,
  cashbackPercent: 5,
}

describe('calculateCommission golden cases', () => {
  it('charges a coupon its absolute admin-set price on site', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:coupon',
      lines: [coupon],
    })

    expect(result.lines[0]).toMatchObject({
      faceValue: 40_000,
      customerPaysNow: 4_000,
      balanceDueAtBusiness: 36_000,
      platformFee: 4_000,
      supplierDue: 0,
      cashbackAmount: 200,
    })
    expect(result.cardCharge).toBe(4_000)
  })

  it('calculates physical commission from the complete line price', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:physical',
      lines: [physical],
    })

    expect(result.lines[0]).toMatchObject({
      faceValue: 10_000,
      customerPaysNow: 10_000,
      balanceDueAtBusiness: 0,
      platformFee: 1_000,
      supplierDue: 9_000,
      cashbackAmount: 500,
    })
  })

  it('aggregates coupon and physical lines without mixing settlement rules', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:mixed',
      lines: [
        { ...coupon, cashbackPercent: 10 },
        { ...physical, cashbackPercent: 10 },
      ],
    })

    expect(result).toMatchObject({
      faceValue: 50_000,
      customerPaysNow: 14_000,
      balanceDueAtBusiness: 36_000,
      platformFee: 5_000,
      supplierDue: 9_000,
      cashbackAmount: 1_400,
      walletApplied: 0,
      cardCharge: 14_000,
    })
  })

  it('applies wallet funds only to the final card charge', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:wallet',
      lines: [coupon, physical],
      walletApplied: agorot(3_000),
    })

    expect(result).toMatchObject({
      customerPaysNow: 14_000,
      platformFee: 5_000,
      supplierDue: 9_000,
      cashbackAmount: 700,
      walletApplied: 3_000,
      cardCharge: 11_000,
    })
  })

  it('rounds once per line for three units priced at 33.33 ILS', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:rounding',
      lines: [
        {
          id: 'rounding-line',
          productType: 'physical',
          unitPrice: agorot(3_333),
          quantity: 3,
          platformPercent: 10,
          cashbackPercent: 0,
        },
      ],
    })

    expect(result.lines[0]).toMatchObject({
      faceValue: 9_999,
      platformFee: 1_000,
      supplierDue: 8_999,
    })
  })

  it('calculates coupon cashback from customerPaysNow and never face value', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:coupon-cashback',
      lines: [{ ...coupon, cashbackPercent: 25 }],
    })

    expect(result.customerPaysNow).toBe(4_000)
    expect(result.cashbackAmount).toBe(1_000)
    expect(result.cashbackAmount).not.toBe(10_000)
  })

  it('supports zero cashback without changing settlement', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:no-cashback',
      lines: [{ ...physical, cashbackPercent: 0 }],
    })

    expect(result.cashbackAmount).toBe(0)
    expect(result.supplierDue).toBe(9_000)
  })

  it('is deterministic for idempotent replay', () => {
    const input: CommissionInput = {
      idempotencyKey: 'checkout:replay',
      lines: [coupon, physical],
      walletApplied: agorot(1_000),
    }

    expect(calculateCommission(input)).toEqual(calculateCommission(input))
    expect(calculateCommission(input).idempotencyKey).toBe('checkout:replay')
  })

  it('rejects wallet funds above customerPaysNow', () => {
    expect(() =>
      calculateCommission({
        idempotencyKey: 'checkout:wallet-overflow',
        lines: [coupon],
        walletApplied: agorot(4_001),
      }),
    ).toThrow('wallet applied must not exceed customerPaysNow')
  })
})

/**
 * Every guard below protects a money invariant. A silently-accepted bad input
 * here becomes a wrong charge, so each one must fail loudly rather than settle
 * on a plausible-looking number.
 */
describe('calculateCommission guards', () => {
  it('requires an idempotency key', () => {
    expect(() => calculateCommission({ idempotencyKey: '   ', lines: [coupon] })).toThrow(TypeError)
  })

  it('requires at least one line', () => {
    expect(() => calculateCommission({ idempotencyKey: 'k', lines: [] })).toThrow(RangeError)
  })

  it('rejects duplicate line ids', () => {
    expect(() =>
      calculateCommission({
        idempotencyKey: 'k',
        lines: [coupon, { ...physical, id: coupon.id }],
      }),
    ).toThrow('commerce line ids must be unique')
  })

  it('requires a non-empty line id', () => {
    expect(() =>
      calculateCommission({ idempotencyKey: 'k', lines: [{ ...coupon, id: '  ' }] }),
    ).toThrow(TypeError)
  })

  it('rejects a non-positive or fractional quantity', () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(() =>
        calculateCommission({ idempotencyKey: 'k', lines: [{ ...physical, quantity }] }),
      ).toThrow(RangeError)
    }
  })

  it('rejects a negative unit price', () => {
    expect(() =>
      calculateCommission({
        idempotencyKey: 'k',
        lines: [{ ...physical, unitPrice: agorot(-1) }],
      }),
    ).toThrow('unit price must not be negative')
  })

  it('rejects a negative wallet balance', () => {
    expect(() =>
      calculateCommission({
        idempotencyKey: 'k',
        lines: [physical],
        walletApplied: agorot(-1),
      }),
    ).toThrow('wallet applied must not be negative')
  })

  it('rejects a percent outside 0..100 on either knob', () => {
    expect(() =>
      calculateCommission({ idempotencyKey: 'k', lines: [{ ...physical, platformPercent: 101 }] }),
    ).toThrow(RangeError)
    expect(() =>
      calculateCommission({ idempotencyKey: 'k', lines: [{ ...physical, cashbackPercent: -1 }] }),
    ).toThrow(RangeError)
  })

  it('allows wallet to cover the on-site charge exactly, leaving a zero card charge', () => {
    const result = calculateCommission({
      idempotencyKey: 'k',
      lines: [coupon],
      walletApplied: agorot(4_000),
    })
    expect(result.cardCharge).toBe(0)
    expect(result.platformFee).toBe(4_000)
  })
})
