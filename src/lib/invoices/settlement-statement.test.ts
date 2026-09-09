import type { PayoutBreakdownLine } from '@/lib/supplier/dashboard'
import { describe, expect, it } from 'vitest'
import {
  buildSettlementStatement,
  isMonthKey,
  israelMonthOf,
  monthsWithActivity,
} from './settlement-statement'

const line = (over: Partial<PayoutBreakdownLine> = {}): PayoutBreakdownLine => ({
  orderItemId: 'item-1',
  productName: 'עיסוי מפנק',
  productType: 'physical',
  platformPercent: 30,
  grossAgorot: 10_000,
  platformFeeAgorot: 3_000,
  supplierPayoutAgorot: 7_000,
  reversedPayoutAgorot: 0,
  settlementStatus: 'settled',
  paidAt: '2026-09-15T10:00:00Z',
  ...over,
})

describe('which month a sale belongs to', () => {
  it('uses the Israeli calendar, not UTC', () => {
    // 22:30 UTC on 30 September is 01:30 on 1 October in Israel. Filing it under
    // September puts it in a month the supplier has already closed.
    expect(israelMonthOf('2026-09-30T22:30:00Z')).toBe('2026-10')
    expect(israelMonthOf('2026-09-30T18:30:00Z')).toBe('2026-09')
  })

  it('answers null for a date it cannot read, rather than the current month', () => {
    expect(israelMonthOf(null)).toBeNull()
    expect(israelMonthOf('not a date')).toBeNull()
  })

  it('accepts only YYYY-MM as a month key', () => {
    expect(isMonthKey('2026-09')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-9')).toBe(false)
    expect(isMonthKey('2026-09-01')).toBe(false)
  })
})

describe('building a month', () => {
  it('refuses a malformed month instead of guessing one', () => {
    expect(() => buildSettlementStatement({ month: 'sept', supplierName: 'x', lines: [] })).toThrow(
      /YYYY-MM/,
    )
  })

  it('keeps only the lines paid in that month', () => {
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'ספא בוטיק',
      lines: [
        line({ orderItemId: 'a', paidAt: '2026-09-01T08:00:00Z' }),
        line({ orderItemId: 'b', paidAt: '2026-10-01T08:00:00Z' }),
        line({ orderItemId: 'c', paidAt: '2026-08-31T08:00:00Z' }),
      ],
    })
    expect(statement.lines.map((l) => l.orderItemId)).toEqual(['a'])
  })

  it('excludes a line that has not been paid, rather than filing it in this month', () => {
    // An unpaid line is money that has not moved. Putting it in a statement
    // has the supplier reconcile against a bank transfer that never happened.
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'x',
      lines: [line({ paidAt: null })],
    })
    expect(statement.lines).toHaveLength(0)
    expect(statement.supplierPayoutAgorot).toBe(0)
  })

  it('totals in integer agorot, exactly', () => {
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'x',
      lines: [
        line({ grossAgorot: 10_001, platformFeeAgorot: 3_000, supplierPayoutAgorot: 7_001 }),
        line({ grossAgorot: 5_555, platformFeeAgorot: 1_666, supplierPayoutAgorot: 3_889 }),
      ],
    })
    expect(statement.grossAgorot).toBe(15_556)
    expect(statement.platformFeeAgorot).toBe(4_666)
    expect(statement.supplierPayoutAgorot).toBe(10_890)
    // The conservation law, stated rather than assumed: what the customer paid
    // is the platform's fee plus the supplier's share, with nothing lost.
    expect(statement.grossAgorot).toBe(statement.platformFeeAgorot + statement.supplierPayoutAgorot)
  })

  it('counts how many of the listed lines have actually settled', () => {
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'x',
      lines: [line({ settlementStatus: 'settled' }), line({ settlementStatus: 'pending' })],
    })
    expect(statement.settledCount).toBe(1)
    expect(statement.lines).toHaveLength(2)
  })
})

describe('the month list offered to the picker', () => {
  it('lists only months with activity, newest first', () => {
    // A rolling twelve would offer a supplier who joined last week eleven
    // months that download as a blank statement.
    expect(
      monthsWithActivity([
        line({ paidAt: '2026-07-02T08:00:00Z' }),
        line({ paidAt: '2026-09-02T08:00:00Z' }),
        line({ paidAt: '2026-09-20T08:00:00Z' }),
        line({ paidAt: null }),
      ]),
    ).toEqual(['2026-09', '2026-07'])
  })
})

describe('a refund inside the month', () => {
  const sold = line({
    orderItemId: 'oi-sold',
    grossAgorot: 10_000,
    platformFeeAgorot: 3_000,
    supplierPayoutAgorot: 7_000,
    paidAt: '2026-09-10T10:00:00Z',
  })
  // What `toPayoutBreakdown` produces for a refunded line: the payout is zero
  // and the share it would have paid moves to `reversedPayoutAgorot`.
  const refunded = line({
    orderItemId: 'oi-refunded',
    grossAgorot: 4_000,
    platformFeeAgorot: 1_200,
    supplierPayoutAgorot: 0,
    reversedPayoutAgorot: 2_800,
    settlementStatus: 'refunded',
    paidAt: '2026-09-12T10:00:00Z',
  })

  it('does not promise the supplier money that was handed back', () => {
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'ספא',
      lines: [sold, refunded],
    })
    expect(statement.supplierPayoutAgorot).toBe(7_000)
    expect(statement.reversedPayoutAgorot).toBe(2_800)
    expect(statement.refundedCount).toBe(1)
  })

  it('adds up: the payout total is exactly the payout column', () => {
    // The property that makes the document reconcilable by a bookkeeper. A
    // total that quietly excluded a listed line while the column still showed
    // its amount would be read as an arithmetic error in our favour.
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'ספא',
      lines: [sold, refunded],
    })
    const columnSum = statement.lines.reduce((sum, row) => sum + row.supplierPayoutAgorot, 0)
    expect(columnSum).toBe(statement.supplierPayoutAgorot)
  })

  it('still lists the refunded line, because it happened', () => {
    const statement = buildSettlementStatement({
      month: '2026-09',
      supplierName: 'ספא',
      lines: [sold, refunded],
    })
    expect(statement.lines.map((row) => row.orderItemId)).toEqual(['oi-sold', 'oi-refunded'])
  })
})
