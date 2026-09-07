import { describe, expect, it } from 'vitest'
import type { RefundLineInput, RefundVoucherInput } from './refund'
import {
  AUTO_APPROVAL_LIMIT,
  AUTO_APPROVAL_WINDOW_DAYS,
  RefundRequestRefusal,
  STATUTORY_CANCELLATION_WINDOW_DAYS,
  decideRefundRequest,
  isInsideStatutoryWindow,
  refundDestinationFor,
} from './refund-request'

const NOW = new Date('2026-09-08T12:00:00Z')
const MS_PER_DAY = 86_400_000

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * MS_PER_DAY)
}

function line(overrides: Partial<RefundLineInput> = {}): RefundLineInput {
  return {
    orderItemId: 'item-1',
    productType: 'coupon',
    settlementStatus: 'paid',
    supplierId: 'supplier-1',
    supplierReleasedAgorot: 0,
    ...overrides,
  }
}

function voucher(overrides: Partial<RefundVoucherInput> = {}): RefundVoucherInput {
  return { voucherId: 'v-1', status: 'issued', ...overrides }
}

function request(overrides: Partial<Parameters<typeof decideRefundRequest>[0]> = {}) {
  return decideRefundRequest({
    cardChargedAgorot: 20_000,
    paidAt: daysBefore(2),
    lines: [line()],
    vouchers: [voucher()],
    ground: 'distance_sale_14d',
    priorAutoApprovals: [],
    now: NOW,
    ...overrides,
  })
}

describe('isInsideStatutoryWindow', () => {
  it('accepts the last day of the window and rejects the first day past it', () => {
    expect(isInsideStatutoryWindow(daysBefore(STATUTORY_CANCELLATION_WINDOW_DAYS), NOW)).toBe(true)
    expect(
      isInsideStatutoryWindow(daysBefore(STATUTORY_CANCELLATION_WINDOW_DAYS + 0.01), NOW),
    ).toBe(false)
  })

  it('rejects a payment dated in the future rather than treating it as fresh', () => {
    // A clock skew or a bad backfill must not open the window, which a bare
    // `elapsed <= 14` would have done for every negative elapsed time.
    expect(isInsideStatutoryWindow(new Date(NOW.getTime() + MS_PER_DAY), NOW)).toBe(false)
  })
})

describe('refundDestinationFor', () => {
  it('sends every statutory ground back to the card', () => {
    // Section 14ה obliges the return of the MONEY. Store credit is not money,
    // and a wallet credit would not discharge the obligation.
    for (const ground of [
      'distance_sale_14d',
      'defect',
      'service_not_provided',
      'duplicate_charge',
    ] as const) {
      expect(refundDestinationFor(ground)).toBe('original_method')
    }
  })

  it('sends the two discretionary grounds to the wallet', () => {
    expect(refundDestinationFor('goodwill')).toBe('wallet')
    expect(refundDestinationFor('extended_window')).toBe('wallet')
  })
})

describe('decideRefundRequest', () => {
  it('auto-approves a clean in-window distance-sale cancellation', () => {
    const decision = request()
    expect(decision.autoApproved).toBe(true)
    expect(decision.state).toBe('approved')
    expect(decision.manualReviewReasons).toEqual([])
    expect(decision.destination).toBe('original_method')
  })

  it('charges the statutory fee: the lower of 5% and 100 shekels', () => {
    expect(request({ cardChargedAgorot: 20_000 }).cancellationFeeAgorot).toBe(1_000)
    // 5% of 4000 shekels is 200 shekels, which the cap cuts to 100.
    expect(request({ cardChargedAgorot: 400_000 }).cancellationFeeAgorot).toBe(10_000)
  })

  it('charges no fee when the fault is ours', () => {
    expect(request({ ground: 'defect' }).cancellationFeeAgorot).toBe(0)
    expect(request({ ground: 'duplicate_charge' }).cancellationFeeAgorot).toBe(0)
  })

  it('demotes to manual review rather than refusing when the window has closed', () => {
    // The load-bearing case. `orders` has no delivery date, so for a physical
    // product the window measured from payment closes EARLY. Refusing here
    // would deny a statutory right on a date we do not hold.
    const decision = request({ paidAt: daysBefore(40) })
    expect(decision.state).toBe('requested')
    expect(decision.autoApproved).toBe(false)
    expect(decision.manualReviewReasons).toContain('window_closed')
  })

  it('treats an undatable payment as outside the window', () => {
    expect(request({ paidAt: undefined }).manualReviewReasons).toContain('window_closed')
  })

  it('stops auto-approving at the limit but still records the request', () => {
    const priors = Array.from({ length: AUTO_APPROVAL_LIMIT }, () => ({
      decidedAt: daysBefore(10),
    }))
    const decision = request({ priorAutoApprovals: priors })
    expect(decision.state).toBe('requested')
    expect(decision.manualReviewReasons).toContain('auto_approval_limit_reached')
  })

  it('still auto-approves one below the limit', () => {
    const priors = Array.from({ length: AUTO_APPROVAL_LIMIT - 1 }, () => ({
      decidedAt: daysBefore(10),
    }))
    expect(request({ priorAutoApprovals: priors }).autoApproved).toBe(true)
  })

  it('ages prior auto-approvals out of the counting window', () => {
    const stale = Array.from({ length: AUTO_APPROVAL_LIMIT }, () => ({
      decidedAt: daysBefore(AUTO_APPROVAL_WINDOW_DAYS + 1),
    }))
    expect(request({ priorAutoApprovals: stale }).autoApproved).toBe(true)
  })

  it('sends a redeemed voucher to a person instead of approving a payout that cannot happen', () => {
    // planOrderRefund throws NOT_REFUNDABLE on consumed value. Auto-approving
    // here would promise the customer a credit the executor must refuse.
    const decision = request({ vouchers: [voucher({ status: 'redeemed' })] })
    expect(decision.state).toBe('requested')
    expect(decision.manualReviewReasons).toContain('value_consumed')
  })

  it('sends an expired voucher to a person for the same reason', () => {
    expect(request({ vouchers: [voucher({ status: 'expired' })] }).manualReviewReasons).toContain(
      'value_consumed',
    )
  })

  it('sends a line whose supplier share has already left to a person', () => {
    const decision = request({
      lines: [line({ settlementStatus: 'split_executed', supplierReleasedAgorot: 5_000 })],
    })
    expect(decision.manualReviewReasons).toContain('supplier_paid')
  })

  it('never auto-approves a claim about the world', () => {
    for (const ground of ['defect', 'service_not_provided', 'goodwill'] as const) {
      const decision = request({ ground })
      expect(decision.autoApproved).toBe(false)
      expect(decision.manualReviewReasons).toContain('unverifiable_claim')
    }
  })

  it('refuses only structurally, when no line can be refunded at all', () => {
    expect(() => request({ lines: [line({ settlementStatus: 'refunded' })] })).toThrow(
      RefundRequestRefusal,
    )
  })

  it('never returns a rejection: adjudicating against the customer is a person job', () => {
    const hostile = request({
      paidAt: daysBefore(400),
      ground: 'goodwill',
      vouchers: [voucher({ status: 'redeemed' })],
      priorAutoApprovals: Array.from({ length: 9 }, () => ({ decidedAt: daysBefore(1) })),
    })
    expect(hostile.state).toBe('requested')
    expect(hostile.manualReviewReasons.length).toBeGreaterThan(3)
  })

  it('keeps requested_agorot a whole non-negative integer', () => {
    expect(request({ cardChargedAgorot: 1234.7 }).requestedAgorot).toBe(1234)
    expect(request({ cardChargedAgorot: -5 }).requestedAgorot).toBe(0)
  })

  it('honours the database fee constraint on every amount it can produce', () => {
    // 131: cancellation_fee_agorot <= LEAST((requested + 19) / 20, 10000).
    // A fee this module computes but the table rejects would fail the INSERT
    // after the notice was already given.
    for (const charged of [0, 1, 19, 20, 999, 20_000, 199_999, 400_000, 10_000_000]) {
      const d = request({ cardChargedAgorot: charged })
      const cap = Math.min(Math.floor((d.requestedAgorot + 19) / 20), 10_000)
      expect(d.cancellationFeeAgorot).toBeLessThanOrEqual(cap)
    }
  })
})
