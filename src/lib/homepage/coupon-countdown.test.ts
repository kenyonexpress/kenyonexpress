import { describe, expect, it } from 'vitest'
import {
  SOON_DAYS,
  countdownDeadline,
  daysLabelHe,
  describeCouponCountdown,
} from './coupon-countdown'

/**
 * UX10: the figures behind the hot-coupon countdown pill. Pure, so the whole
 * judgement (days, clock, urgency, the Hebrew day word) is pinned without a
 * timer or a DOM.
 */
describe('describeCouponCountdown', () => {
  const NOW = new Date('2026-10-14T08:00:00Z')
  const at = (iso: string) => describeCouponCountdown(new Date(iso), NOW)

  it('splits the remainder into whole days and an HH:MM:SS clock', () => {
    expect(at('2026-10-17T12:12:33Z')).toEqual({
      ended: false,
      days: 3,
      clock: '04:12:33',
      daysLabel: '3 ימים',
      urgency: 'soon',
    })
  })

  it('is "today" with no day word under a day, and "none" past the soon window', () => {
    expect(at('2026-10-14T20:30:00Z')).toMatchObject({
      days: 0,
      clock: '12:30:00',
      daysLabel: null,
      urgency: 'today',
    })
    expect(at('2026-10-30T08:00:00Z')).toMatchObject({ days: 16, urgency: 'none' })
    expect(at(`2026-10-${14 + SOON_DAYS}T08:00:01Z`)).toMatchObject({ urgency: 'soon' })
    expect(at(`2026-10-${15 + SOON_DAYS}T08:00:01Z`)).toMatchObject({ urgency: 'none' })
  })

  it('has ended at the deadline and after it, with a stopped clock', () => {
    const ended = { ended: true, days: 0, clock: '00:00:00', daysLabel: null, urgency: 'ended' }
    expect(at('2026-10-14T08:00:00Z')).toEqual(ended)
    expect(at('2026-10-01T00:00:00Z')).toEqual(ended)
    expect(describeCouponCountdown(new Date('not a date'), NOW)).toEqual(ended)
  })

  it('counts the last second before the deadline as 00:00:00 of the same day, never a negative', () => {
    expect(at('2026-10-14T08:00:00.999Z')).toMatchObject({ ended: false, clock: '00:00:00' })
    expect(at('2026-10-14T08:00:01Z')).toMatchObject({ ended: false, clock: '00:00:01' })
  })
})

describe('daysLabelHe', () => {
  it('declines the day word the way Hebrew does', () => {
    expect(daysLabelHe(0)).toBeNull()
    expect(daysLabelHe(1)).toBe('יום אחד')
    expect(daysLabelHe(2)).toBe('יומיים')
    expect(daysLabelHe(3)).toBe('3 ימים')
    expect(daysLabelHe(14)).toBe('14 ימים')
  })
})

describe('countdownDeadline', () => {
  it('mounts a countdown only for a set, parseable deadline', () => {
    expect(countdownDeadline(null)).toBeNull()
    expect(countdownDeadline(undefined)).toBeNull()
    expect(countdownDeadline('')).toBeNull()
    expect(countdownDeadline('yesterday')).toBeNull()
    expect(countdownDeadline('2026-12-31T21:59:59+00:00')).toBe('2026-12-31T21:59:59+00:00')
  })
})
