import { describe, expect, it } from 'vitest'
import {
  computeCancellationFee,
  describeRefundBlockers,
  isSameClearingDay,
  planOrderRefund,
} from './refund'

const paidCoupon = {
  orderItemId: 'line-1',
  productType: 'coupon' as const,
  settlementStatus: 'paid' as const,
}

const paidPhysical = {
  orderItemId: 'line-2',
  productType: 'physical' as const,
  settlementStatus: 'paid' as const,
}

describe('describeRefundBlockers', () => {
  it('reports nothing when a card refund is legal', () => {
    expect(
      describeRefundBlockers({
        lines: [paidCoupon],
        vouchers: [{ voucherId: 'v1', status: 'issued' }],
      }),
    ).toEqual([])
  })

  it('blocks on a redeemed voucher and says so', () => {
    // Its value was consumed at the business. Pulling the card money back would
    // refund value the supplier already handed over.
    const blockers = describeRefundBlockers({
      lines: [paidCoupon],
      vouchers: [{ voucherId: 'v1', status: 'redeemed' }],
    })
    expect(blockers).toHaveLength(1)
    expect(blockers[0]?.message).toContain('מומשו')
    expect(blockers[0]?.voucherIds).toEqual(['v1'])
  })

  it('blocks on an expired voucher separately from a redeemed one', () => {
    const blockers = describeRefundBlockers({
      lines: [paidCoupon],
      vouchers: [
        { voucherId: 'v1', status: 'redeemed' },
        { voucherId: 'v2', status: 'expired' },
      ],
    })
    expect(blockers).toHaveLength(2)
    expect(blockers[0]?.voucherIds).toEqual(['v1'])
    expect(blockers[1]?.voucherIds).toEqual(['v2'])
  })

  it('counts the vouchers it is blocking on', () => {
    const blockers = describeRefundBlockers({
      lines: [paidCoupon],
      vouchers: [
        { voucherId: 'v1', status: 'redeemed' },
        { voucherId: 'v2', status: 'redeemed' },
      ],
    })
    expect(blockers[0]?.message).toContain('2')
  })

  it('blocks when no line can transition to refunded', () => {
    const blockers = describeRefundBlockers({
      lines: [{ ...paidCoupon, settlementStatus: 'redeemed' }],
      vouchers: [],
    })
    expect(blockers).toHaveLength(1)
    expect(blockers[0]?.orderItemIds).toEqual(['line-1'])
  })

  it('does not block when one line of several is still refundable', () => {
    expect(
      describeRefundBlockers({
        lines: [{ ...paidCoupon, settlementStatus: 'redeemed' }, paidPhysical],
        vouchers: [],
      }),
    ).toEqual([])
  })

  it('treats an already-refunded order as having nothing left to refund', () => {
    const blockers = describeRefundBlockers({
      lines: [{ ...paidCoupon, settlementStatus: 'refunded' }],
      vouchers: [],
    })
    expect(blockers).toHaveLength(1)
    expect(blockers[0]?.message).toContain('אין שורות')
  })

  it('agrees with planOrderRefund: whatever it names, the planner refuses', () => {
    // The screen and the planner must not disagree about whether a refund is
    // possible, or the admin sees a green button that throws.
    const cases = [
      { lines: [paidCoupon], vouchers: [{ voucherId: 'v1', status: 'redeemed' as const }] },
      { lines: [paidCoupon], vouchers: [{ voucherId: 'v1', status: 'expired' as const }] },
      { lines: [{ ...paidCoupon, settlementStatus: 'redeemed' as const }], vouchers: [] },
    ]
    for (const input of cases) {
      expect(describeRefundBlockers(input).length).toBeGreaterThan(0)
      expect(() =>
        planOrderRefund({
          cardChargedAgorot: 10_000,
          lines: input.lines,
          vouchers: input.vouchers,
          isDefectClaim: false,
          now: new Date('2026-07-28T00:00:00Z'),
        }),
      ).toThrow()
    }
  })

  it('agrees with planOrderRefund the other way: no blockers means it plans', () => {
    const input = {
      lines: [paidCoupon],
      vouchers: [{ voucherId: 'v1', status: 'issued' as const }],
    }
    expect(describeRefundBlockers(input)).toEqual([])
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      ...input,
      isDefectClaim: false,
      now: new Date('2026-07-28T00:00:00Z'),
    })
    expect(plan.voucherRefunds).toEqual(['v1'])
  })
})

describe('computeCancellationFee', () => {
  it('takes the lower of 5 percent and 100 shekels', () => {
    expect(computeCancellationFee(10_000, false)).toBe(500)
    expect(computeCancellationFee(1_000_000, false)).toBe(10_000)
  })

  it('waives the fee on a defect claim', () => {
    expect(computeCancellationFee(10_000, true)).toBe(0)
  })

  it('charges nothing on a zero or negative charge', () => {
    expect(computeCancellationFee(0, false)).toBe(0)
    expect(computeCancellationFee(-100, false)).toBe(0)
  })
})

describe('isSameClearingDay', () => {
  // Everything here is written in UTC on purpose: the whole point of the
  // function is that the answer is decided in Asia/Jerusalem, so a test written
  // in local time would agree with a broken implementation.

  it('is the same day when both instants fall in the same Israeli date', () => {
    // 2026-08-06 03:00 and 20:00 Israel time (UTC+3 in August).
    expect(
      isSameClearingDay(new Date('2026-08-06T00:00:00Z'), new Date('2026-08-06T17:00:00Z')),
    ).toBe(true)
  })

  it('is a different day across the Israeli midnight even 20 minutes apart', () => {
    // 23:50 and 00:10 Israel time. Cardcom transmits the batch in between, so
    // the deal stops being cancellable — this is the case an "is it within 24
    // hours" implementation gets wrong, and it is the expensive direction:
    // asking to cancel a transmitted deal is a rejected request, not a credit.
    expect(
      isSameClearingDay(new Date('2026-08-06T20:50:00Z'), new Date('2026-08-06T21:10:00Z')),
    ).toBe(false)
  })

  it('stays the same day 23 hours apart when no Israeli midnight is crossed', () => {
    // 00:10 and 23:50 Israel time on 2026-08-07.
    expect(
      isSameClearingDay(new Date('2026-08-06T21:10:00Z'), new Date('2026-08-07T20:50:00Z')),
    ).toBe(true)
  })

  it('reads UTC midnight as the previous Israeli day, not the next one', () => {
    // 2026-08-07T00:30Z is 03:30 on the 7th in Israel, and 2026-08-06T22:30Z is
    // 01:30 on the 7th. A UTC-based comparison would call these different days.
    expect(
      isSameClearingDay(new Date('2026-08-06T22:30:00Z'), new Date('2026-08-07T00:30:00Z')),
    ).toBe(true)
  })
})

describe('planOrderRefund: same-day cancellation', () => {
  const charged = new Date('2026-08-06T09:00:00Z')

  it('cancels instead of crediting when the charge is from today', () => {
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [paidPhysical],
      vouchers: [],
      isDefectClaim: false,
      chargedAt: charged,
      now: new Date('2026-08-06T15:00:00Z'),
    })
    expect(plan.cancelOnly).toBe(true)
    // No clearing happened, so there is no clearing cost to pass on and the
    // customer gets the whole charge back.
    expect(plan.cancellationFeeAgorot).toBe(0)
    expect(plan.refundAmountAgorot).toBe(10_000)
  })

  it('credits, with the fee, once the day has turned', () => {
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [paidPhysical],
      vouchers: [],
      isDefectClaim: false,
      chargedAt: charged,
      now: new Date('2026-08-07T15:00:00Z'),
    })
    expect(plan.cancelOnly).toBe(false)
    expect(plan.cancellationFeeAgorot).toBe(500)
    expect(plan.refundAmountAgorot).toBe(9_500)
  })

  it('takes the credit path when the charge time is unknown', () => {
    // The safe read. Cancelling a deal that has already been transmitted is
    // refused by Cardcom; crediting one that has not is merely more expensive.
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [paidPhysical],
      vouchers: [],
      isDefectClaim: false,
      now: new Date('2026-08-06T15:00:00Z'),
    })
    expect(plan.cancelOnly).toBe(false)
  })

  it('never cancels a partial refund', () => {
    // Half a deal cannot be un-transmitted: CancelOnly voids the whole deal, so
    // sending it for a partial would return the entire charge.
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [paidPhysical],
      vouchers: [],
      isDefectClaim: false,
      chargedAt: charged,
      now: new Date('2026-08-06T15:00:00Z'),
      partialAmountAgorot: 4_000,
    })
    expect(plan.cancelOnly).toBe(false)
    expect(plan.refundAmountAgorot).toBe(4_000)
  })
})

describe('planOrderRefund: supplier debits', () => {
  const splitPhysical = {
    orderItemId: 'line-9',
    productType: 'physical' as const,
    settlementStatus: 'split_executed' as const,
    supplierId: 'sup-1',
    supplierReleasedAgorot: 7_000,
  }

  it('claws back the share of a line that was already split', () => {
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [splitPhysical],
      vouchers: [],
      isDefectClaim: false,
      now: new Date('2026-08-07T12:00:00Z'),
    })
    expect(plan.supplierDebits).toEqual([
      { orderItemId: 'line-9', supplierId: 'sup-1', amountAgorot: 7_000 },
    ])
  })

  it('claws back nothing from a line refunded before the split', () => {
    // Nothing left for the supplier from `paid`, so a debit row here would
    // invent a liability and cost the supplier money they never received.
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [{ ...splitPhysical, settlementStatus: 'paid' as const }],
      vouchers: [],
      isDefectClaim: false,
      now: new Date('2026-08-07T12:00:00Z'),
    })
    expect(plan.supplierDebits).toEqual([])
  })

  it('writes no row for a split line whose supplier share was zero', () => {
    // A coupon line splits 100/0: the platform keeps the whole prepayment and
    // the supplier collects at the counter. A zero debit is a journal row that
    // says nothing.
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [{ ...splitPhysical, supplierReleasedAgorot: 0 }],
      vouchers: [],
      isDefectClaim: false,
      now: new Date('2026-08-07T12:00:00Z'),
    })
    expect(plan.supplierDebits).toEqual([])
  })

  it('writes no row for a split line with no supplier on it', () => {
    const plan = planOrderRefund({
      cardChargedAgorot: 10_000,
      lines: [{ ...splitPhysical, supplierId: null }],
      vouchers: [],
      isDefectClaim: false,
      now: new Date('2026-08-07T12:00:00Z'),
    })
    expect(plan.supplierDebits).toEqual([])
  })

  it('debits only the lines this refund actually reverses', () => {
    const plan = planOrderRefund({
      cardChargedAgorot: 20_000,
      lines: [
        splitPhysical,
        // Already refunded: skipped by the planner, so it must not be debited a
        // second time.
        { ...splitPhysical, orderItemId: 'line-10', settlementStatus: 'refunded' as const },
      ],
      vouchers: [],
      isDefectClaim: false,
      now: new Date('2026-08-07T12:00:00Z'),
    })
    expect(plan.supplierDebits.map((d) => d.orderItemId)).toEqual(['line-9'])
  })
})
