import { agorot, ilsToAgorot, sumAgorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COUPON_UPFRONT_PERCENT,
  DEFAULT_PLATFORM_COMMISSION_PERCENT,
  type SettlementLineInput,
  calculateSettlement,
} from './settlement'

function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`missing item at ${index}`)
  return item
}

const couponLine = (over: Partial<SettlementLineInput> = {}): SettlementLineInput => ({
  id: 'line-coupon',
  productType: 'coupon',
  unitPrice: ilsToAgorot('400'),
  quantity: 1,
  upfrontPercent: 10,
  commissionPercent: 5,
  ...over,
})

const physicalLine = (over: Partial<SettlementLineInput> = {}): SettlementLineInput => ({
  id: 'line-physical',
  productType: 'physical',
  unitPrice: ilsToAgorot('100'),
  quantity: 1,
  commissionPercent: 5,
  ...over,
})

describe('calculateSettlement — split math', () => {
  it('coupon: 10% upfront to escrow, 5% commission on the on-site amount', () => {
    const result = calculateSettlement({ idempotencyKey: 'k', lines: [couponLine()] })
    const line = at(result.lines, 0)
    expect(line.faceValue).toBe(40000)
    expect(line.paidOnSite).toBe(4000)
    expect(line.balanceDueAtBusiness).toBe(36000)
    expect(line.escrowHeld).toBe(4000)
    expect(line.commission).toBe(200)
    expect(line.escrowReleaseToSupplier).toBe(3800)
    expect(line.supplierImmediate).toBe(0)
    expect(result.cardCharge).toBe(4000)
  })

  it('physical: customer pays face, immediate split of face minus commission', () => {
    const result = calculateSettlement({ idempotencyKey: 'k', lines: [physicalLine()] })
    const line = at(result.lines, 0)
    expect(line.faceValue).toBe(10000)
    expect(line.paidOnSite).toBe(10000)
    expect(line.balanceDueAtBusiness).toBe(0)
    expect(line.commission).toBe(500)
    expect(line.supplierImmediate).toBe(9500)
    expect(line.escrowHeld).toBe(0)
    expect(line.escrowReleaseToSupplier).toBe(0)
  })

  it('applies defaults: 5% commission, 10% coupon upfront', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [
        { id: 'c', productType: 'coupon', unitPrice: ilsToAgorot('200'), quantity: 1 },
        { id: 'p', productType: 'physical', unitPrice: ilsToAgorot('200'), quantity: 1 },
      ],
    })
    expect(DEFAULT_PLATFORM_COMMISSION_PERCENT).toBe(5)
    expect(DEFAULT_COUPON_UPFRONT_PERCENT).toBe(10)
    const coupon = at(result.lines, 0)
    const physical = at(result.lines, 1)
    expect(coupon.paidOnSite).toBe(2000) // 10% of 200₪
    expect(coupon.commission).toBe(100) // 5% of the on-site amount
    expect(physical.commission).toBe(1000) // 5% of 200₪
  })

  it('honors admin per-product commission override', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [physicalLine({ commissionPercent: 12 })],
    })
    expect(at(result.lines, 0).commission).toBe(1200)
    expect(at(result.lines, 0).supplierImmediate).toBe(8800)
  })

  it('keeps conservation invariants on a mixed cart', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [
        couponLine({ id: 'c1', unitPrice: ilsToAgorot('33.33'), quantity: 3 }),
        couponLine({ id: 'c2', unitPrice: ilsToAgorot('149.9'), upfrontPercent: 25 }),
        physicalLine({ id: 'p1', unitPrice: ilsToAgorot('79.99'), quantity: 2 }),
      ],
    })
    for (const line of result.lines) {
      expect(line.paidOnSite + line.balanceDueAtBusiness).toBe(line.faceValue)
      if (line.productType === 'coupon') {
        expect(line.escrowHeld).toBe(line.paidOnSite)
        expect(line.commission + line.escrowReleaseToSupplier).toBe(line.escrowHeld)
      } else {
        expect(line.commission + line.supplierImmediate).toBe(line.faceValue)
      }
    }
    expect(result.paidOnSite).toBe(result.lines.reduce((acc, l) => acc + l.paidOnSite, 0))
    expect(result.cardCharge).toBe(result.paidOnSite)
  })

  it('splits per-unit escrow exactly, first unit absorbs the remainder', () => {
    // 3 units, face 99.99₪ each => paidOnSite 10% = 3000 agorot total (2999.7 rounded)
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ unitPrice: ilsToAgorot('99.99'), quantity: 3 })],
    })
    const line = at(result.lines, 0)
    expect(line.perUnitEscrow).toHaveLength(3)
    expect(sumAgorot(line.perUnitEscrow.map((u) => u.held))).toBe(line.escrowHeld)
    expect(sumAgorot(line.perUnitEscrow.map((u) => u.commission))).toBe(line.commission)
    expect(sumAgorot(line.perUnitEscrow.map((u) => u.release))).toBe(line.escrowReleaseToSupplier)
    for (const unit of line.perUnitEscrow) {
      expect(unit.commission + unit.release).toBe(unit.held)
      expect(unit.commission).toBeGreaterThanOrEqual(0)
      expect(unit.release).toBeGreaterThanOrEqual(0)
    }
    // remainder goes to the first unit only
    expect(at(line.perUnitEscrow, 0).held).toBeGreaterThanOrEqual(at(line.perUnitEscrow, 1).held)
    expect(at(line.perUnitEscrow, 1)).toEqual(at(line.perUnitEscrow, 2))
  })

  it('edge: 0% upfront coupon holds nothing and charges nothing', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ upfrontPercent: 0 })],
    })
    const line = at(result.lines, 0)
    expect(line.paidOnSite).toBe(0)
    expect(line.escrowHeld).toBe(0)
    expect(line.commission).toBe(0)
    expect(line.escrowReleaseToSupplier).toBe(0)
    expect(line.balanceDueAtBusiness).toBe(40000)
    expect(result.cardCharge).toBe(0)
  })

  it('edge: 100% upfront coupon leaves no balance at the business', () => {
    const result = calculateSettlement({
      idempotencyKey: 'k',
      lines: [couponLine({ upfrontPercent: 100 })],
    })
    const line = at(result.lines, 0)
    expect(line.paidOnSite).toBe(40000)
    expect(line.balanceDueAtBusiness).toBe(0)
    expect(line.escrowReleaseToSupplier).toBe(38000)
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
    expect(withWallet.escrowHeld).toBe(without.escrowHeld)
    expect(withWallet.commission).toBe(without.commission)
    expect(withWallet.supplierImmediate).toBe(without.supplierImmediate)
  })

  it('rejects wallet above the on-site charge', () => {
    expect(() =>
      calculateSettlement({
        idempotencyKey: 'k',
        lines: [couponLine()], // on-site 4000 agorot
        walletApplied: agorot(4001),
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
        lines: [couponLine({ commissionPercent: 101 })],
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
})
