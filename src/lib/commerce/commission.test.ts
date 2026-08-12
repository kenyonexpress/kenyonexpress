import { describe, expect, it } from 'vitest'
import { type CommissionInput, applyDiscountAgorot, calculateCommission } from './commission'
import { agorot } from './money'

// ADMIN-ARCHITECTURE §0: coupon on-site charge is the ABSOLUTE admin price
// (40₪ here on a 400₪ face). That prepayment splits by platform_percent: 20%
// of 40₪ stays with the platform, 32₪ is the supplier residual. No escrow.
const coupon = {
  id: 'coupon-1',
  productType: 'coupon' as const,
  unitPrice: agorot(40_000),
  quantity: 1,
  couponPriceUnit: agorot(4_000),
  platformPercent: 20,
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
  it('charges a coupon its absolute admin-set price on site and splits it', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:coupon',
      lines: [coupon],
    })

    expect(result.lines[0]).toMatchObject({
      faceValue: 40_000,
      customerPaysNow: 4_000,
      balanceDueAtBusiness: 36_000,
      // 20% of the 4,000 prepayment, NOT of the 40,000 face: the balance is
      // collected in cash at the business and never passes through us (C5).
      platformFee: 800,
      supplierImmediate: 3_200,
      supplierDue: 3_200,
      platformPercentBps: 2_000,
      cashbackAmount: 200,
    })
    expect(result.cardCharge).toBe(4_000)
  })

  it('at 100 percent keeps the whole coupon prepayment on the platform', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:coupon-full-price',
      lines: [{ ...coupon, platformPercent: 100 }],
    })

    expect(result.lines[0]?.supplierImmediate).toBe(0)
    expect(result.lines[0]?.supplierDue).toBe(0)
    expect(result.supplierDue).toBe(0)
    expect(result.platformFee).toBe(result.customerPaysNow)
  })

  it('splits the prepayment exactly, leaving nothing unaccounted for', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:coupon-conservation',
      lines: [coupon],
    })

    const line = result.lines[0]
    if (!line) throw new Error('expected one line')
    expect(line.platformFee + line.supplierDue).toBe(line.customerPaysNow)
    expect(line.customerPaysNow + line.balanceDueAtBusiness).toBe(line.faceValue)
  })

  it('refuses a coupon line with no platform percent instead of assuming one', () => {
    const { platformPercent: _omitted, ...noPercent } = coupon

    expect(() =>
      calculateCommission({ idempotencyKey: 'checkout:no-percent', lines: [noPercent] }),
    ).toThrow(TypeError)
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

  it('applies discount_percent to the physical on-site charge before the split', () => {
    const result = calculateCommission({
      idempotencyKey: 'checkout:physical-discount',
      lines: [{ ...physical, discountPercent: 10 }],
    })

    expect(result.lines[0]).toMatchObject({
      faceValue: 9_000,
      customerPaysNow: 9_000,
      platformFee: 900,
      supplierDue: 8_100,
    })
    expect(result.cardCharge).toBe(9_000)
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
      // 800 from the coupon prepayment + 1,000 from the physical line.
      platformFee: 1_800,
      // Coupon residual 3,200 + physical 9,000.
      supplierImmediate: 12_200,
      supplierDue: 12_200,
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
      platformFee: 1_800,
      supplierImmediate: 12_200,
      supplierDue: 12_200,
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
    // Wallet is a payment source, not a discount: paying by wallet must leave
    // the commission and the supplier figures exactly where they were.
    expect(result.platformFee).toBe(800)
    expect(result.supplierDue).toBe(3_200)
    expect(result.customerPaysNow).toBe(4_000)
  })
})

describe('applyDiscountAgorot', () => {
  it('returns face when discount is missing or zero', () => {
    expect(applyDiscountAgorot(agorot(10_000), null)).toBe(10_000)
    expect(applyDiscountAgorot(agorot(10_000), 0)).toBe(10_000)
  })

  it('refuses a 100 percent discount', () => {
    expect(() => applyDiscountAgorot(agorot(10_000), 100)).toThrow(/less than 100/)
  })
})

/**
 * The guards, not the golden cases.
 *
 * Every branch below was uncovered, which meant the CI coverage floor for this
 * module sat at 89.89% against a 95% threshold and the money job was red. That
 * is the worst place to have a blind spot: these are the clauses that make the
 * engine refuse to price a line rather than invent a number for it, and the
 * "no default exists" rule from the 2026-07-24 business rules is enforced
 * nowhere else in the codebase.
 */
describe('calculateCommission refuses to invent a missing number', () => {
  it('refuses a physical line with no platform percent, undefined or null', () => {
    // There is deliberately no fallback percent. A physical line whose product
    // never had one set must fail loudly at checkout, not settle at 0% and pay
    // the supplier the whole face value.
    const { platformPercent: _drop, ...noPercent } = physical
    expect(() =>
      calculateCommission({ idempotencyKey: 'k', lines: [noPercent as typeof physical] }),
    ).toThrow(TypeError)
    expect(() =>
      calculateCommission({ idempotencyKey: 'k', lines: [{ ...physical, platformPercent: null }] }),
    ).toThrow(/platform percent is required for physical line physical-1/)
  })

  it('refuses a coupon line with no absolute coupon price, undefined or null', () => {
    const { couponPriceUnit: _drop, ...noPrice } = coupon
    expect(() =>
      calculateCommission({ idempotencyKey: 'k', lines: [noPrice as typeof coupon] }),
    ).toThrow(TypeError)
    // `null` is unreachable through the type, but the guard checks for it
    // because the value arrives from the database as a nullable column and
    // reaches here through a `satisfies`-free mapping layer.
    expect(() =>
      calculateCommission({
        idempotencyKey: 'k',
        lines: [{ ...coupon, couponPriceUnit: null as unknown as undefined }],
      }),
    ).toThrow(/coupon price is required for coupon line coupon-1/)
  })

  it('refuses a coupon price of zero or below', () => {
    // A free coupon would settle 0 to the platform while still handing the
    // customer a voucher the business has to honour at full face value.
    for (const bad of [agorot(0), agorot(-1)]) {
      expect(() =>
        calculateCommission({
          idempotencyKey: 'k',
          lines: [{ ...coupon, couponPriceUnit: bad }],
        }),
      ).toThrow(RangeError)
    }
  })

  it('refuses a coupon price above the face value', () => {
    // Above face, balanceDueAtBusiness would go negative: the business would
    // owe the customer money at redemption.
    expect(() =>
      calculateCommission({
        idempotencyKey: 'k',
        lines: [{ ...coupon, couponPriceUnit: agorot(40_001) }],
      }),
    ).toThrow(/must be positive and at most the unit price/)
  })

  it('allows a coupon priced at exactly its face value', () => {
    // The boundary the guard above must NOT reject: paying the whole face on
    // site is a legitimate coupon, it just leaves nothing due at the business.
    const result = calculateCommission({
      idempotencyKey: 'k',
      lines: [{ ...coupon, couponPriceUnit: agorot(40_000) }],
    })
    expect(result.balanceDueAtBusiness).toBe(0)
    expect(result.customerPaysNow).toBe(40_000)
    // 20% of the full-face prepayment.
    expect(result.platformFee).toBe(8_000)
    expect(result.supplierDue).toBe(32_000)
  })
})
