import { describe, expect, it } from 'vitest'
import {
  RETURN_REASONS,
  RETURN_REASON_CODES,
  evaluateReturnEligibility,
  previewReturnRefund,
  refundDueBy,
  returnRequestFromForm,
  returnRequestSchema,
  returnTimeline,
  rmaNumber,
} from './policy'

const NOW = new Date('2026-10-08T10:00:00.000Z')
const ID = '8f3c2a1b-7d6e-4f50-9a1b-2c3d4e5f6a7b'

const coupon = (voucherStatuses: string[] = ['issued']) => ({
  productType: 'coupon' as const,
  settlementStatus: 'paid',
  deliveredAt: null,
  voucherStatuses,
})
const physical = (deliveredAt: string | null, settlementStatus = 'split_executed') => ({
  productType: 'physical' as const,
  settlementStatus,
  deliveredAt,
  voucherStatuses: [] as string[],
})

describe('rmaNumber', () => {
  it('is the Israel day and the first eight hex digits of the id', () => {
    expect(rmaNumber(ID, '2026-10-08T21:30:00.000Z')).toBe('RMA-261009-8F3C2A1B')
    expect(rmaNumber(ID, '2026-10-08T10:00:00.000Z')).toBe('RMA-261008-8F3C2A1B')
  })

  it('is stable for the same row', () => {
    expect(rmaNumber(ID, NOW)).toBe(rmaNumber(ID, NOW.toISOString()))
  })

  it('does not throw on a bad date', () => {
    expect(rmaNumber(ID, 'nope')).toBe('RMA-000000-8F3C2A1B')
  })
})

describe('evaluateReturnEligibility', () => {
  it('refuses an unpaid order', () => {
    const out = evaluateReturnEligibility({
      status: 'pending',
      paidAt: null,
      lines: [coupon()],
      openRequest: false,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: false, reason: 'not_paid' })
  })

  it('refuses an order that already has an open request', () => {
    const out = evaluateReturnEligibility({
      status: 'paid',
      paidAt: '2026-10-01T00:00:00Z',
      lines: [coupon()],
      openRequest: true,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: false, reason: 'already_open' })
  })

  it('refuses a refunded order', () => {
    const out = evaluateReturnEligibility({
      status: 'refunded',
      paidAt: '2026-10-01T00:00:00Z',
      lines: [coupon()],
      openRequest: false,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: false, reason: 'already_refunded' })
  })

  it('refuses when every line is already refunded or cancelled', () => {
    const out = evaluateReturnEligibility({
      status: 'paid',
      paidAt: '2026-10-01T00:00:00Z',
      lines: [physical('2026-10-02T00:00:00Z', 'refunded'), physical(null, 'cancelled')],
      openRequest: false,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: false, reason: 'nothing_to_return' })
  })

  it('runs 14 days from payment for a coupon order', () => {
    const paidAt = '2026-09-20T12:00:00.000Z'
    const inside = evaluateReturnEligibility({
      status: 'paid',
      paidAt,
      lines: [coupon()],
      openRequest: false,
      now: new Date('2026-10-04T11:59:00.000Z'),
    })
    expect(inside).toMatchObject({ ok: true, windowEndsAt: '2026-10-04T12:00:00.000Z' })
    const outside = evaluateReturnEligibility({
      status: 'paid',
      paidAt,
      lines: [coupon()],
      openRequest: false,
      now: new Date('2026-10-04T12:00:01.000Z'),
    })
    expect(outside).toMatchObject({ ok: false, reason: 'window_closed' })
  })

  it('runs from delivery, not payment, when the parcel arrived later', () => {
    const out = evaluateReturnEligibility({
      status: 'paid',
      paidAt: '2026-09-01T00:00:00Z',
      lines: [physical('2026-10-01T00:00:00.000Z')],
      openRequest: false,
      now: NOW,
    })
    expect(out).toMatchObject({
      ok: true,
      hasPhysical: true,
      windowEndsAt: '2026-10-15T00:00:00.000Z',
    })
  })

  it('stays open while a physical line has not been delivered', () => {
    const out = evaluateReturnEligibility({
      status: 'paid',
      paidAt: '2026-01-01T00:00:00Z',
      lines: [physical(null)],
      openRequest: false,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: true, windowEndsAt: null })
  })

  it('offers both destinations for an unredeemed coupon', () => {
    const out = evaluateReturnEligibility({
      status: 'paid',
      paidAt: '2026-10-01T00:00:00Z',
      lines: [coupon(['issued'])],
      openRequest: false,
      now: NOW,
    })
    expect(out.ok && out.allowedDestinations).toEqual(['original_method', 'wallet'])
  })

  it('offers only store credit once a coupon was redeemed or expired', () => {
    for (const status of ['redeemed', 'expired']) {
      const out = evaluateReturnEligibility({
        status: 'paid',
        paidAt: '2026-10-01T00:00:00Z',
        lines: [coupon([status])],
        openRequest: false,
        now: NOW,
      })
      expect(out.ok && out.allowedDestinations).toEqual(['wallet'])
    }
  })
})

describe('previewReturnRefund', () => {
  it('takes the capped 5% fee on a change of mind back to the card', () => {
    expect(
      previewReturnRefund({
        requestedAgorot: 10_000,
        reasonCode: 'changed_mind',
        destination: 'original_method',
      }),
    ).toEqual({ feeAgorot: 500, refundAgorot: 9_500 })
    expect(
      previewReturnRefund({
        requestedAgorot: 500_000,
        reasonCode: 'other',
        destination: 'original_method',
      }),
    ).toEqual({ feeAgorot: 10_000, refundAgorot: 490_000 })
  })

  it('takes no fee when the fault is the trader’s', () => {
    for (const code of RETURN_REASON_CODES.filter((c) => !RETURN_REASONS[c].feeApplies)) {
      expect(
        previewReturnRefund({
          requestedAgorot: 10_000,
          reasonCode: code,
          destination: 'original_method',
        }),
      ).toEqual({ feeAgorot: 0, refundAgorot: 10_000 })
    }
  })

  it('takes no fee on store credit, whatever the reason', () => {
    expect(
      previewReturnRefund({
        requestedAgorot: 10_000,
        reasonCode: 'changed_mind',
        destination: 'wallet',
      }),
    ).toEqual({ feeAgorot: 0, refundAgorot: 10_000 })
  })

  it('never goes negative or fractional', () => {
    expect(
      previewReturnRefund({
        requestedAgorot: -5,
        reasonCode: 'changed_mind',
        destination: 'original_method',
      }),
    ).toEqual({ feeAgorot: 0, refundAgorot: 0 })
    expect(
      previewReturnRefund({
        requestedAgorot: 999.9,
        reasonCode: 'changed_mind',
        destination: 'original_method',
      }),
    ).toEqual({ feeAgorot: 50, refundAgorot: 949 })
  })
})

describe('reason codes and grounds', () => {
  it('maps every code to a ground the database declares', () => {
    const grounds = new Set([
      'distance_sale_14d',
      'defect',
      'service_not_provided',
      'duplicate_charge',
      'extended_window',
      'goodwill',
    ])
    for (const code of RETURN_REASON_CODES)
      expect(grounds.has(RETURN_REASONS[code].ground)).toBe(true)
  })

  it('agrees with 131: a fee is never charged on defect or duplicate_charge', () => {
    for (const code of RETURN_REASON_CODES) {
      const reason = RETURN_REASONS[code]
      if (reason.ground === 'defect' || reason.ground === 'duplicate_charge') {
        expect(reason.feeApplies).toBe(false)
      }
    }
  })
})

describe('returnRequestSchema', () => {
  it('reads the form and refuses an unknown code or destination', () => {
    const fd = new FormData()
    fd.set('orderId', ID)
    fd.set('reasonCode', 'defective')
    fd.set('destination', 'wallet')
    fd.set('note', '  נשבר בדרך  ')
    const parsed = returnRequestSchema.safeParse(returnRequestFromForm(fd))
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.note).toBe('נשבר בדרך')

    fd.set('reasonCode', 'because')
    expect(returnRequestSchema.safeParse(returnRequestFromForm(fd)).success).toBe(false)
    fd.set('reasonCode', 'defective')
    fd.set('destination', 'cash')
    expect(returnRequestSchema.safeParse(returnRequestFromForm(fd)).success).toBe(false)
  })

  it('fails an absent reason with the Hebrew message, not a type error', () => {
    const fd = new FormData()
    fd.set('orderId', ID)
    fd.set('destination', 'wallet')
    const parsed = returnRequestSchema.safeParse(returnRequestFromForm(fd))
    expect(parsed.success).toBe(false)
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe('בחרו סיבה להחזרה')
  })
})

describe('status tracking', () => {
  it('walks four steps and marks the current one', () => {
    expect(returnTimeline('requested').map((s) => [s.done, s.current])).toEqual([
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ])
    expect(returnTimeline('completed').every((s) => s.done)).toBe(true)
  })

  it('stops a rejected request at the first step and a failed one at execution', () => {
    const rejected = returnTimeline('rejected')
    expect(rejected[0]).toMatchObject({ done: false, current: true })
    const failed = returnTimeline('failed')
    expect(failed.map((s) => s.done)).toEqual([true, true, false, false])
    expect(failed[2]).toMatchObject({ current: true })
  })

  it('derives the statutory deadline exactly as the trigger does', () => {
    expect(refundDueBy('2026-10-08T10:00:00.000Z').toISOString()).toBe('2026-10-22T10:00:00.000Z')
  })
})
