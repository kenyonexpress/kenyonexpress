import { describe, expect, it } from 'vitest'
import {
  GIFT_WRAP_FEE_AGOROT,
  MAX_GIFT_SCHEDULE_DAYS,
  giftDateInputBounds,
  giftWrapFeeAgorot,
  resolveGiftDeliverAt,
} from './wrap'

const NOW = new Date('2026-09-10T12:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString()

describe('resolveGiftDeliverAt', () => {
  it('treats empty, absent and whitespace as "send it now"', () => {
    for (const value of ['', '   ', null, undefined]) {
      expect(resolveGiftDeliverAt(value, NOW)).toEqual({ ok: true, deliverAt: null })
    }
  })

  it('accepts a plain date, which is what the picker posts', () => {
    const result = resolveGiftDeliverAt('2026-10-03', NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected a date')
    expect(result.deliverAt?.toISOString()).toBe('2026-10-03T00:00:00.000Z')
  })

  it('refuses a value that is not a date instead of silently sending now', () => {
    // The distinction that matters: a customer who typed something and got an
    // immediate send has been ignored, and the coupon is already in the
    // recipient's inbox by the time they notice.
    const result = resolveGiftDeliverAt('next tuesday', NOW)
    expect(result).toEqual({ ok: false, error: 'תאריך המשלוח אינו תקין' })
  })

  it('refuses a date well in the past', () => {
    const result = resolveGiftDeliverAt(day(-30), NOW)
    expect(result.ok).toBe(false)
  })

  it('tolerates a full day of timezone slack rather than refusing "today"', () => {
    /**
     * The regression this exists for: a date input yields LOCAL midnight, the
     * server compares in UTC, and Israel is two or three hours ahead. A shopper
     * choosing today at 09:00 in Tel Aviv posts an instant that is already
     * yesterday in UTC. Without the tolerance the form tells them their own
     * "today" is in the past.
     */
    const result = resolveGiftDeliverAt(day(-0.5), NOW)
    expect(result.ok).toBe(true)
  })

  it('collapses a tolerated past date to null rather than parking the outbox in the past', () => {
    // A `next_attempt_at` in the past is due, so the mail goes out at once
    // either way. Returning null says so on purpose instead of by accident.
    const result = resolveGiftDeliverAt(day(-0.5), NOW)
    if (!result.ok) throw new Error('expected ok')
    expect(result.deliverAt).toBeNull()
  })

  it('refuses a date past the ceiling', () => {
    const result = resolveGiftDeliverAt(day(MAX_GIFT_SCHEDULE_DAYS + 2), NOW)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.error).toContain(String(MAX_GIFT_SCHEDULE_DAYS))
  })

  it('accepts a date just inside the ceiling', () => {
    expect(resolveGiftDeliverAt(day(MAX_GIFT_SCHEDULE_DAYS - 1), NOW).ok).toBe(true)
  })
})

describe('giftWrapFeeAgorot', () => {
  it('charges the fee when it was asked for on a gift', () => {
    expect(giftWrapFeeAgorot({ requested: true, isGift: true, columnAvailable: true })).toBe(
      GIFT_WRAP_FEE_AGOROT,
    )
  })

  it('charges nothing when it was not asked for', () => {
    expect(giftWrapFeeAgorot({ requested: false, isGift: true, columnAvailable: true })).toBe(0)
  })

  it('charges nothing on an order that is not a gift', () => {
    // There is nothing to wrap when there is nobody to send it to.
    expect(giftWrapFeeAgorot({ requested: true, isGift: false, columnAvailable: true })).toBe(0)
  })

  it('charges NOTHING when there is no column to record the charge in', () => {
    /**
     * The one that matters. 226 is pending, so `orders.gift_wrap_fee_agorot`
     * may not exist. Charging anyway would put ₪15 on a card with no row in the
     * system explaining it - unanswerable at exactly the moment somebody asks
     * for it back.
     */
    expect(giftWrapFeeAgorot({ requested: true, isGift: true, columnAvailable: false })).toBe(0)
  })

  it('is a whole number of agorot, because it reaches the card charge', () => {
    expect(Number.isInteger(GIFT_WRAP_FEE_AGOROT)).toBe(true)
    expect(GIFT_WRAP_FEE_AGOROT).toBeGreaterThan(0)
  })
})

describe('giftDateInputBounds', () => {
  it('spans from today to the ceiling', () => {
    const bounds = giftDateInputBounds(new Date('2026-09-10T12:00:00'))
    expect(bounds.min).toBe('2026-09-10')
    expect(bounds.max).toBe('2027-09-10')
  })

  it('uses the LOCAL day, not the UTC one', () => {
    /**
     * `toISOString().slice(0, 10)` is the obvious implementation and is wrong
     * for the first hours after local midnight: in Israel it names yesterday,
     * so the picker would offer a `min` the server then refuses.
     */
    const justAfterLocalMidnight = new Date(2026, 8, 10, 0, 30)
    expect(giftDateInputBounds(justAfterLocalMidnight).min).toBe('2026-09-10')
  })

  it('agrees with the server ceiling it is supposed to mirror', () => {
    const now = new Date('2026-09-10T12:00:00.000Z')
    const { max } = giftDateInputBounds(now)
    // A picker offering a date the action refuses is a form that fails on
    // submit for a value it suggested.
    expect(resolveGiftDeliverAt(max, now).ok).toBe(true)
  })
})
