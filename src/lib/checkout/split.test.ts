import { agorot } from '@/lib/commerce/money'
import { type CalculateSplitInput, calculateSplitInputSchema } from '@/lib/validations/checkout'
import { describe, expect, it } from 'vitest'
import { calculateSplit, toSplitView } from './split'

function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`missing item at ${index}`)
  return item
}

// The coupon line carries the ABSOLUTE admin price (40₪ on a 400₪ face), plus
// a platform percent that splits that 40₪ prepayment (2026-07-27 model).
const couponLine = (over: Partial<CalculateSplitInput['lines'][number]> = {}) => ({
  id: 'coupon-1',
  productType: 'coupon' as const,
  unitPriceIls: 400,
  quantity: 1,
  couponPriceIls: 40,
  platformPercent: 20,
  cashbackPercent: 5,
  ...over,
})

const physicalLine = (over: Partial<CalculateSplitInput['lines'][number]> = {}) => ({
  id: 'physical-1',
  productType: 'physical' as const,
  unitPriceIls: 100,
  quantity: 1,
  platformPercent: 10,
  cashbackPercent: 5,
  ...over,
})

const split = (over: Partial<CalculateSplitInput> = {}): CalculateSplitInput => ({
  idempotencyKey: 'split:test',
  walletAppliedIls: 0,
  lines: [couponLine()],
  ...over,
})

describe('calculateSplit — wire view', () => {
  it('charges a coupon its absolute price on site, remainder at the business', () => {
    const result = calculateSplit(split())
    const line = at(result.lines, 0)

    expect(line.faceValueIls).toBe(400)
    expect(line.customerPaysNowIls).toBe(40)
    expect(line.balanceDueAtBusinessIls).toBe(360)
    // 20% of the 40₪ prepayment, not of the 400₪ face.
    expect(line.platformFeeIls).toBe(8)
    expect(line.supplierImmediateIls).toBe(0)
    expect(line.escrowHeldIls).toBe(32)
    expect(line.supplierDueIls).toBe(32)
    expect(result.cardChargeIls).toBe(40)
  })

  it('charges a physical line in full and splits the commission off the total', () => {
    const result = calculateSplit(split({ lines: [physicalLine()] }))
    const line = at(result.lines, 0)

    expect(line.faceValueIls).toBe(100)
    expect(line.customerPaysNowIls).toBe(100)
    expect(line.balanceDueAtBusinessIls).toBe(0)
    expect(line.platformFeeIls).toBe(10)
    expect(line.supplierDueIls).toBe(90)
  })

  it('keeps per-line rules separate on a mixed cart instead of blending the total', () => {
    const result = calculateSplit(split({ lines: [couponLine(), physicalLine()] }))

    expect(result.faceValueIls).toBe(500)
    expect(result.customerPaysNowIls).toBe(140)
    expect(result.balanceDueAtBusinessIls).toBe(360)
    // 8₪ off the coupon prepayment + 10₪ off the physical line.
    expect(result.platformFeeIls).toBe(18)
    expect(result.supplierImmediateIls).toBe(90)
    expect(result.escrowHeldIls).toBe(32)
    expect(result.supplierDueIls).toBe(122)
    expect(result.cardChargeIls).toBe(140)
  })

  it('reconstructs face value from the on-site charge plus the in-store balance', () => {
    const result = calculateSplit(
      split({
        lines: [
          couponLine({ id: 'c1', unitPriceIls: 33.33, quantity: 3, couponPriceIls: 10 }),
          couponLine({ id: 'c2', unitPriceIls: 149.9, couponPriceIls: 99.9 }),
          physicalLine({ id: 'p1', unitPriceIls: 79.99, quantity: 2, platformPercent: 7.5 }),
        ],
      }),
    )

    for (const line of result.lines) {
      expect(line.customerPaysNowIls + line.balanceDueAtBusinessIls).toBeCloseTo(
        line.faceValueIls,
        2,
      )
    }
    expect(result.customerPaysNowIls + result.balanceDueAtBusinessIls).toBeCloseTo(
      result.faceValueIls,
      2,
    )
  })

  it('applies wallet funds to the card charge only, never to the settlement figures', () => {
    const withWallet = calculateSplit(
      split({ lines: [couponLine(), physicalLine()], walletAppliedIls: 30 }),
    )
    const without = calculateSplit(split({ lines: [couponLine(), physicalLine()] }))

    expect(withWallet.walletAppliedIls).toBe(30)
    expect(withWallet.cardChargeIls).toBe(without.cardChargeIls - 30)
    expect(withWallet.platformFeeIls).toBe(without.platformFeeIls)
    expect(withWallet.supplierDueIls).toBe(without.supplierDueIls)
    expect(withWallet.customerPaysNowIls).toBe(without.customerPaysNowIls)
  })

  it('reports percents back in whole percent, not basis points', () => {
    const result = calculateSplit(
      split({ lines: [physicalLine({ platformPercent: 12.5, cashbackPercent: 2.5 })] }),
    )
    const line = at(result.lines, 0)

    expect(line.platformPercent).toBe(12.5)
    expect(line.cashbackPercent).toBe(2.5)
  })

  it('reports the coupon percent it actually applied, so the snapshot is auditable', () => {
    // This asserted 0 until 2026-07-27, when coupon pricing genuinely ignored
    // the percent. It now participates, and reporting 0 while charging 20%
    // would put a wrong number in the order_items snapshot.
    const result = calculateSplit(split({ lines: [couponLine()] }))
    expect(at(result.lines, 0).platformPercent).toBe(20)
  })

  it('derives cashback from the on-site charge, never from face value', () => {
    const result = calculateSplit(
      split({ lines: [couponLine({ platformPercent: 10, cashbackPercent: 25 })] }),
    )

    // on-site is 40₪, so cashback is 10₪ — not 100₪ (25% of the 400₪ face).
    expect(result.customerPaysNowIls).toBe(40)
    expect(result.cashbackAmountIls).toBe(10)
  })

  it('carries the idempotency key through unchanged', () => {
    expect(calculateSplit(split({ idempotencyKey: 'checkout:abc' })).idempotencyKey).toBe(
      'checkout:abc',
    )
  })

  it('is deterministic across repeated calls', () => {
    const input = split({ lines: [couponLine(), physicalLine()], walletAppliedIls: 10 })
    expect(calculateSplit(input)).toEqual(calculateSplit(input))
  })

  it('accepts fractional shekel prices without losing agorot', () => {
    const result = calculateSplit(split({ lines: [physicalLine({ unitPriceIls: 0.01 })] }))
    const line = at(result.lines, 0)

    expect(line.faceValueIls).toBe(0.01)
    expect(line.customerPaysNowIls).toBe(0.01)
  })

  it('rejects wallet funds above the on-site charge', () => {
    expect(() => calculateSplit(split({ walletAppliedIls: 40.01 }))).toThrow(RangeError)
  })

  // Documented behaviour, not an endorsement: the engine takes a JS number and
  // normalizes it with toFixed(2), so sub-agorot precision is rounded away
  // silently rather than rejected. The string form of ilsAmount is the strict
  // gate (see the schema test below); a numeric caller gets rounding.
  it('rounds a sub-agorot price to the nearest agorot instead of throwing', () => {
    const result = calculateSplit(split({ lines: [physicalLine({ unitPriceIls: 1.006 })] }))
    expect(at(result.lines, 0).faceValueIls).toBe(1.01)
  })

  it('rejects a string price carrying more than two fraction digits', () => {
    expect(calculateSplitInputSchema.safeParse(split()).success).toBe(true)
    expect(
      calculateSplitInputSchema.safeParse({
        ...split(),
        lines: [{ ...physicalLine(), unitPriceIls: '1.005' }],
      }).success,
    ).toBe(false)
  })
})

describe('toSplitView', () => {
  it('converts an agorot commission result into the shekel wire shape', () => {
    const view = toSplitView({
      idempotencyKey: 'view:1',
      lines: [
        {
          id: 'l1',
          productType: 'physical',
          quantity: 1,
          faceValue: agorot(12_345),
          customerPaysNow: agorot(12_345),
          balanceDueAtBusiness: agorot(0),
          platformPercentBps: 1_250,
          platformFee: agorot(1_543),
          supplierImmediate: agorot(10_802),
          escrowHeld: agorot(0),
          supplierDue: agorot(10_802),
          cashbackPercentBps: 250,
          cashbackAmount: agorot(309),
        },
      ],
      faceValue: agorot(12_345),
      customerPaysNow: agorot(12_345),
      balanceDueAtBusiness: agorot(0),
      platformFee: agorot(1_543),
      supplierImmediate: agorot(10_802),
      escrowHeld: agorot(0),
      supplierDue: agorot(10_802),
      cashbackAmount: agorot(309),
      walletApplied: agorot(0),
      cardCharge: agorot(12_345),
    })

    expect(view.faceValueIls).toBe(123.45)
    expect(at(view.lines, 0).platformPercent).toBe(12.5)
    expect(at(view.lines, 0).cashbackPercent).toBe(2.5)
    expect(at(view.lines, 0).supplierDueIls).toBe(108.02)
    // A physical line settles immediately and holds nothing.
    expect(at(view.lines, 0).supplierImmediateIls).toBe(108.02)
    expect(at(view.lines, 0).escrowHeldIls).toBe(0)
  })
})
