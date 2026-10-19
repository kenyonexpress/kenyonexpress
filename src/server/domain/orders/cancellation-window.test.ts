import { describe, expect, it } from 'vitest'
import {
  cancellationDeadline,
  customerCancellationGround,
  effectiveCancellationWindowDays,
} from './cancellation-window'
import { decideRefundRequest } from './refund-request'

const DAY = 86_400_000
const paid = new Date('2026-10-01T10:00:00Z')
const daysAfter = (days: number) => new Date(paid.getTime() + days * DAY)

describe('effectiveCancellationWindowDays', () => {
  it('never goes below the statutory 14', () => {
    expect(effectiveCancellationWindowDays([7])).toBe(14)
    expect(effectiveCancellationWindowDays([null, undefined])).toBe(14)
    expect(effectiveCancellationWindowDays([])).toBe(14)
  })

  it('takes the shortest product window in the order', () => {
    expect(effectiveCancellationWindowDays([30, 21])).toBe(21)
    expect(effectiveCancellationWindowDays([30, null])).toBe(14)
  })
})

describe('customerCancellationGround', () => {
  it('is statutory inside 14 days and with no payment date', () => {
    expect(customerCancellationGround(paid, daysAfter(3), 30)).toBe('distance_sale_14d')
    expect(customerCancellationGround(undefined, daysAfter(40), 30)).toBe('distance_sale_14d')
  })

  it('is the extended window past 14 days inside the product window', () => {
    expect(customerCancellationGround(paid, daysAfter(20), 30)).toBe('extended_window')
  })

  it('falls back to statutory past every window, so a person decides', () => {
    expect(customerCancellationGround(paid, daysAfter(31), 30)).toBe('distance_sale_14d')
  })

  it('reports the deadline', () => {
    expect(cancellationDeadline(paid, 14).toISOString()).toBe(daysAfter(14).toISOString())
  })
})

describe('decideRefundRequest with a product window', () => {
  const base = {
    cardChargedAgorot: 50_000,
    paidAt: paid,
    lines: [
      {
        orderItemId: 'i1',
        productType: 'coupon' as const,
        settlementStatus: 'paid' as const,
        supplierId: null,
        supplierReleasedAgorot: 0,
      },
    ],
    vouchers: [],
    priorAutoApprovals: [],
  }

  it('charges the statutory fee inside 14 days, to the card', () => {
    const d = decideRefundRequest({ ...base, ground: 'distance_sale_14d', now: daysAfter(5) })
    expect(d.destination).toBe('original_method')
    expect(d.cancellationFeeAgorot).toBe(2_500)
  })

  it('caps the statutory fee at 100 shekels', () => {
    const d = decideRefundRequest({
      ...base,
      cardChargedAgorot: 400_000,
      ground: 'distance_sale_14d',
      now: daysAfter(5),
    })
    expect(d.cancellationFeeAgorot).toBe(10_000)
  })

  it('gives the extended window whole, to the wallet, and auto-approves inside it', () => {
    const d = decideRefundRequest({
      ...base,
      ground: 'extended_window',
      windowDays: 30,
      now: daysAfter(20),
    })
    expect(d.destination).toBe('wallet')
    expect(d.cancellationFeeAgorot).toBe(0)
    expect(d.autoApproved).toBe(true)
  })

  it('sends an extended-window request past the product window to a person', () => {
    const d = decideRefundRequest({
      ...base,
      ground: 'extended_window',
      windowDays: 30,
      now: daysAfter(40),
    })
    expect(d.autoApproved).toBe(false)
    expect(d.manualReviewReasons).toContain('window_closed')
  })
})
