import { describe, expect, it } from 'vitest'
import { computeCancellationFee, describeRefundBlockers, planOrderRefund } from './refund'

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
