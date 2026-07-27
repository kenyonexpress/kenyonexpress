import { agorot, ilsToAgorot, sumAgorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import { type SettlementLineInput, calculateSettlement } from './settlement'

function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`missing item at ${index}`)
  return item
}

// Final rules (docs/ADMIN-ARCHITECTURE.md section 0, 2026-07-27): a coupon
// charges its ABSOLUTE admin-set price on site, and that prepayment splits by
// the product's own platform_percent exactly like a physical line. Face 400₪,
// coupon price 40₪ per unit, platform 30% of the 40₪.
const couponLine = (over: Partial<SettlementLineInput> = {}): SettlementLineInput => ({
  id: 'line-coupon',
  productType: 'coupon',
  unitPrice: ilsToAgorot('400'),
  quantity: 1,
  couponPriceUnit: ilsToAgorot('40'),
  platformPercent: 30,
  ...over,
})

const physicalLine = (over: Partial<SettlementLineInput> = {}): SettlementLineInput => ({
  id: 'line-physical',
  productType: 'physical',
  unitPrice: ilsToAgorot('100'),
  quantity: 1,
  platformPercent: 5,
  ...over,
})

describe('calculateSettlement — final business rules', () => {
  it('coupon: absolute price on site, split by the product percent', () => {
    const result = calculateSettlement({ idempotencyKey: 'k', lines: [couponLine()] })
    const line = at(result.lines, 0)
    expect(line.faceValue).toBe(40000)
    expect(line.paidOnSite).toBe(4000)
    expect(line.balanceDueAtBusiness).toBe(36000)
    expect(line.commission).toBe(1200) // 30% of the 40₪ paid on site
    expect(line.supplierDue).toBe(2800) // the residual, not a second multiplication
    expect(line.platformPercentBps).toBe(3000)
    expect(result.cardCharge).toBe(4000)
  })

  // The behaviour the old engine hardcoded is still reachable, as one admin
  // choice among many rather than a constant nobody can change.
  it('coupon at 100 percent reproduces the abolished platform-keeps-everything rule', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ platformPercent: 100 })],
    })
    const line = at(result.lines, 0)
    expect(line.commission).toBe(line.paidOnSite)
    expect(line.supplierDue).toBe(0)
  })

  it('coupon at 0 percent hands the whole prepayment to the supplier', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ platformPercent: 0 })],
    })
    const line = at(result.lines, 0)
    expect(line.commission).toBe(0)
    expect(line.supplierDue).toBe(line.paidOnSite)
  })

  // The balance is collected in cash at the counter and never reaches us, so a
  // percent on it would bill the supplier for money we never held.
  it('coupon commission is charged on the prepayment, never on the face value', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ platformPercent: 50 })],
    })
    const line = at(result.lines, 0)
    expect(line.commission).toBe(2000) // 50% of 4000, not of 40000
    expect(line.commission).toBeLessThan(line.paidOnSite)
  })

  it('physical: customer pays face, platform_percent split, remainder to supplier', () => {
    const result = calculateSettlement({ idempotencyKey: 'k', lines: [physicalLine()] })
    const line = at(result.lines, 0)
    expect(line.faceValue).toBe(10000)
    expect(line.paidOnSite).toBe(10000)
    expect(line.balanceDueAtBusiness).toBe(0)
    expect(line.commission).toBe(500)
    expect(line.supplierDue).toBe(9500)
    expect(line.perUnitVoucher).toHaveLength(0)
  })

  // There is no default percent and no default coupon price. A line missing
  // its mandatory value must fail loudly rather than settle on an invention.
  it('rejects a physical line with no platform percent', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [
          {
            id: 'p',
            productType: 'physical',
            unitPrice: ilsToAgorot('200'),
            quantity: 1,
          } as unknown as SettlementLineInput,
        ],
      }),
    ).toThrow(/platform percent is required/)
  })

  it('rejects a coupon line with no platform percent', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ platformPercent: undefined })],
      }),
    ).toThrow(/platform percent is required for coupon/)
  })

  it('rejects a coupon line with no coupon price', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [
          {
            id: 'c',
            productType: 'coupon',
            unitPrice: ilsToAgorot('200'),
            quantity: 1,
          },
        ],
      }),
    ).toThrow(/coupon price is required/)
  })

  it('rejects a coupon price of zero or above the unit price', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ couponPriceUnit: agorot(0) })],
      }),
    ).toThrow(/positive and at most the unit price/)
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ couponPriceUnit: ilsToAgorot('400.01') })],
      }),
    ).toThrow(/positive and at most the unit price/)
  })

  it('honors admin per-product percent on physical lines', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [physicalLine({ platformPercent: 12 })],
    })
    expect(at(result.lines, 0).commission).toBe(1200)
    expect(at(result.lines, 0).supplierDue).toBe(8800)
  })

  it('honors the same knob across the three live split values', () => {
    // 70 / 75 / 85 to the supplier are the only values in the live catalog.
    for (const [supplierSplit, expectedCommission] of [
      [70, 1200],
      [75, 1000],
      [85, 600],
    ] as const) {
      const result = calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ platformPercent: 100 - supplierSplit })],
      })
      const line = at(result.lines, 0)
      expect(line.commission).toBe(expectedCommission)
      expect(line.supplierDue).toBe(4000 - expectedCommission)
    }
  })

  it('keeps conservation invariants on a mixed cart', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [
        couponLine({
          id: 'c1',
          unitPrice: ilsToAgorot('33.33'),
          couponPriceUnit: ilsToAgorot('10'),
          quantity: 3,
          platformPercent: 33.33,
        }),
        couponLine({
          id: 'c2',
          unitPrice: ilsToAgorot('149.9'),
          couponPriceUnit: ilsToAgorot('99.9'),
          platformPercent: 15,
        }),
        physicalLine({ id: 'p1', unitPrice: ilsToAgorot('79.99'), quantity: 2 }),
      ],
    })
    for (const line of result.lines) {
      expect(line.paidOnSite + line.balanceDueAtBusiness).toBe(line.faceValue)
      // The invariant is now identical on both types: the two shares add back to
      // exactly what the customer paid on site, with no agora created or lost.
      expect(line.commission + line.supplierDue).toBe(line.paidOnSite)
    }
    expect(result.paidOnSite).toBe(result.lines.reduce((acc, l) => acc + l.paidOnSite, 0))
    expect(result.commission + result.supplierDue).toBe(result.paidOnSite)
    expect(result.cardCharge).toBe(result.paidOnSite)
  })

  it('conserves the on-site charge at every awkward percent', () => {
    for (const platformPercent of [0, 0.01, 7.5, 33.33, 50, 66.67, 85, 99.99, 100]) {
      const result = calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ couponPriceUnit: ilsToAgorot('33.33'), platformPercent })],
      })
      const line = at(result.lines, 0)
      expect(line.commission + line.supplierDue).toBe(line.paidOnSite)
      expect(line.commission).toBeGreaterThanOrEqual(0)
      expect(line.supplierDue).toBeGreaterThanOrEqual(0)
    }
  })

  it('splits per-unit voucher money exactly, first unit absorbs the remainder', () => {
    // 3 units, face 99.99₪ each, coupon price 33.33₪ each.
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [
        couponLine({
          unitPrice: ilsToAgorot('99.99'),
          couponPriceUnit: ilsToAgorot('33.33'),
          quantity: 3,
        }),
      ],
    })
    const line = at(result.lines, 0)
    expect(line.perUnitVoucher).toHaveLength(3)
    expect(sumAgorot(line.perUnitVoucher.map((u) => u.faceValue))).toBe(line.faceValue)
    expect(sumAgorot(line.perUnitVoucher.map((u) => u.paidOnSite))).toBe(line.paidOnSite)
    expect(sumAgorot(line.perUnitVoucher.map((u) => u.balanceDue))).toBe(line.balanceDueAtBusiness)
    for (const unit of line.perUnitVoucher) {
      expect(unit.paidOnSite + unit.balanceDue).toBe(unit.faceValue)
      expect(unit.paidOnSite).toBeGreaterThanOrEqual(0)
      expect(unit.balanceDue).toBeGreaterThanOrEqual(0)
    }
    // remainder goes to the first unit only
    expect(at(line.perUnitVoucher, 0).paidOnSite).toBeGreaterThanOrEqual(
      at(line.perUnitVoucher, 1).paidOnSite,
    )
    expect(at(line.perUnitVoucher, 1)).toEqual(at(line.perUnitVoucher, 2))
  })

  it('edge: coupon price equal to face leaves no balance at the business', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ couponPriceUnit: ilsToAgorot('400') })],
    })
    const line = at(result.lines, 0)
    expect(line.paidOnSite).toBe(40000)
    expect(line.balanceDueAtBusiness).toBe(0)
    expect(line.commission).toBe(12000)
    expect(line.supplierDue).toBe(28000)
  })

  it('wallet reduces only the card charge, never settlement amounts', () => {
    const withWallet = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine(), physicalLine()],
      walletApplied: ilsToAgorot('30'),
    })
    const without = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine(), physicalLine()],
    })
    expect(withWallet.cardCharge).toBe(without.cardCharge - 3000)
    expect(withWallet.commission).toBe(without.commission)
    expect(withWallet.supplierDue).toBe(without.supplierDue)
  })

  it('rejects wallet above the on-site charge', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine()], // on-site 4000 agorot
        walletApplied: agorot(14001),
      }),
    ).toThrowError(RangeError)
  })

  it('rejects invalid input shapes', () => {
    expect(() => calculateSettlement({ idempotencyKey: ' ', lines: [couponLine()] })).toThrow()
    expect(() => calculateSettlement({ idempotencyKey: 'k', lines: [] })).toThrow()
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ id: 'dup' }), physicalLine({ id: 'dup' })],
      }),
    ).toThrow()
    expect(() =>
      calculateSettlement({ idempotencyKey: 'k', lines: [couponLine({ quantity: 0 })] }),
    ).toThrow()
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [physicalLine({ platformPercent: 101 })],
      }),
    ).toThrow()
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ platformPercent: 101 })],
      }),
    ).toThrow()
  })

  it('is deterministic for the same input', () => {
    const input = {
      idempotencyKey: 'same',
      lines: [couponLine(), physicalLine()],
      walletApplied: ilsToAgorot('10'),
    }
    expect(calculateSettlement(input)).toEqual(calculateSettlement(input))
  })

  it('rejects a negative unit price', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [physicalLine({ unitPrice: agorot(-1) })],
      }),
    ).toThrow('unit price must not be negative')
  })

  it('rejects a negative wallet balance', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [physicalLine()],
        walletApplied: agorot(-1),
      }),
    ).toThrow('wallet applied must not be negative')
  })

  it('rejects a null platform percent as loudly as a missing one', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [physicalLine({ platformPercent: null as unknown as number })],
      }),
    ).toThrow(/platform percent is required/)
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ platformPercent: null as unknown as number })],
      }),
    ).toThrow(/platform percent is required/)
  })

  it('rejects a null coupon price on a coupon line', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine({ couponPriceUnit: null as unknown as ReturnType<typeof agorot> })],
      }),
    ).toThrow(/coupon price is required/)
  })

  it('snapshots cashback off the on-site amount when a percent is given', () => {
    // coupon price 40₪ on site, 5% cashback => 2₪.
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ cashbackPercent: 5 })],
    })
    expect(at(result.lines, 0).paidOnSite).toBe(4000)
    expect(at(result.lines, 0).cashbackAmount).toBe(200)
    expect(result.cashbackAmount).toBe(200)
  })
})
