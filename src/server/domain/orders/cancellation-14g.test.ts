import { describe, expect, it } from 'vitest'
import { businessDaysBetween, decideCancellation14g } from './cancellation-14g'

// 2026-11-01 is a Sunday. Noon UTC is 14:00 in Israel, so the calendar date is
// the same on both sides and the tests read as dates.
const SUN = new Date('2026-11-01T12:00:00Z')
const day = (n: number) => new Date(SUN.getTime() + n * 24 * 60 * 60 * 1000)

const base = {
  orderStatus: 'paid',
  paidAt: SUN.toISOString(),
  chargedAgorot: 50_000,
  vouchers: [{ status: 'issued', usedAt: null }],
  bookedServiceAt: null,
  now: day(1),
}

describe('businessDaysBetween', () => {
  it.each([
    [0, 3, 2], // Sun -> Wed: Mon, Tue
    [0, 2, 1], // Sun -> Tue: Mon
    [0, 1, 0], // Sun -> Mon
    [4, 7, 0], // Thu -> Sun: Fri, Sat are not business days
    [4, 8, 1], // Thu -> Mon: Sun
    [0, 0, 0], // same day
  ])('day %i to day %i is %i', (from, to, expected) => {
    expect(businessDaysBetween(day(from), day(to))).toBe(expected)
  })

  it('reads the date in Israel, not in UTC', () => {
    // 22:30 UTC on Sunday is already Monday 00:30 in Israel.
    const lateSunday = new Date('2026-11-01T22:30:00Z')
    expect(businessDaysBetween(lateSunday, day(3))).toBe(1)
  })
})

describe('decideCancellation14g', () => {
  it('allows an unredeemed paid order inside 14 days, with the deadline and fee', () => {
    const d = decideCancellation14g(base)
    expect(d.allowed).toBe(true)
    expect(d.deadline?.toISOString()).toBe(day(14).toISOString())
    expect(d.feeAgorot).toBe(2_500) // 5% of 500 ILS
  })

  it('caps the fee at 100 ILS', () => {
    expect(decideCancellation14g({ ...base, chargedAgorot: 1_000_000 }).feeAgorot).toBe(10_000)
  })

  it('keeps the fee an integer for an odd amount', () => {
    expect(Number.isInteger(decideCancellation14g({ ...base, chargedAgorot: 999 }).feeAgorot)).toBe(
      true,
    )
  })

  it('refuses an unpaid or refunded order', () => {
    for (const orderStatus of ['pending', 'refunded', 'cancelled']) {
      const d = decideCancellation14g({ ...base, orderStatus })
      expect(d.allowed).toBe(false)
      if (!d.allowed) expect(d.reason).toBe('ORDER_NOT_PAID')
    }
  })

  it('allows the last instant of day 14 and refuses the one after', () => {
    expect(decideCancellation14g({ ...base, now: day(14) }).allowed).toBe(true)
    const late = decideCancellation14g({ ...base, now: new Date(day(14).getTime() + 1) })
    expect(late.allowed).toBe(false)
    if (!late.allowed) expect(late.reason).toBe('WINDOW_CLOSED')
  })

  it('does not treat an unknown payment time as an expired window', () => {
    const d = decideCancellation14g({ ...base, paidAt: 'not a date', now: day(400) })
    expect(d.allowed).toBe(true)
    expect(d.deadline).toBeNull()
  })

  it('refuses once any voucher on the order is redeemed', () => {
    const byStatus = decideCancellation14g({
      ...base,
      vouchers: [{ status: 'issued' }, { status: 'redeemed' }],
    })
    const byTimestamp = decideCancellation14g({
      ...base,
      vouchers: [{ status: 'issued', usedAt: day(1).toISOString() }],
    })
    for (const d of [byStatus, byTimestamp]) {
      expect(d.allowed).toBe(false)
      if (!d.allowed) expect(d.reason).toBe('REDEEMED')
    }
  })

  it('refuses inside 2 business days of a booked service and allows outside', () => {
    // now = Monday. Thursday leaves Tue+Wed = 2: allowed.
    expect(decideCancellation14g({ ...base, bookedServiceAt: day(4) }).allowed).toBe(true)
    // Wednesday leaves Tue = 1: refused.
    const close = decideCancellation14g({ ...base, bookedServiceAt: day(3) })
    expect(close.allowed).toBe(false)
    if (!close.allowed) expect(close.reason).toBe('SERVICE_TOO_CLOSE')
  })

  it('does not count a weekend as notice', () => {
    // now = Thursday, service Sunday: Fri+Sat in between are not business days.
    const d = decideCancellation14g({ ...base, now: day(4), bookedServiceAt: day(7) })
    expect(d.allowed).toBe(false)
  })

  it('ignores a voucher that was transferred, cancelled or expired', () => {
    const d = decideCancellation14g({
      ...base,
      vouchers: [{ status: 'transferred' }, { status: 'expired' }, { status: 'cancelled' }],
    })
    expect(d.allowed).toBe(true)
  })
})
