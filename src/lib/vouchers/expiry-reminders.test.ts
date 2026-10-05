import { endOfJerusalemDay } from '@/lib/vouchers/expiry-date'
import {
  REMINDER_BUCKETS,
  type ReminderCandidate,
  jerusalemDaysRemaining,
  reminderBucketFor,
  reminderDedupeKey,
  reminderWindows,
} from '@/lib/vouchers/expiry-reminders'
import { describe, expect, it } from 'vitest'

/**
 * The selection query's edges, in days remaining: 8 (nothing), 7 (first
 * reminder), 2 (still the first bucket), 1 (second reminder), 0 (still the
 * second), past (nothing). Every one of these was reachable by a one-character
 * edit to the SQL (`<` for `<=`, `+ 1` dropped from the floor) that no other
 * test would notice, and two of them -- 0 and the double-match on a short
 * voucher -- were the exact failures 227 was written against.
 */

/** 01:00 Israel summer time on 6 October 2026: the nightly run, after midnight. */
const RUN_NIGHT = new Date('2026-10-05T22:00:00Z')

function expiring(isoDate: string): Date {
  const instant = endOfJerusalemDay(isoDate)
  if (!instant) throw new Error(`bad fixture date ${isoDate}`)
  return instant
}

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    id: 'v-1',
    status: 'issued',
    expiresAt: expiring('2026-10-13'),
    email: 'holder@example.test',
    ...overrides,
  }
}

describe('reminderWindows', () => {
  it('gives [7, 1] the two half-open windows 227 describes', () => {
    expect(reminderWindows([7, 1])).toEqual([
      { bucket: 7, floor: 1 },
      { bucket: 1, floor: -1 },
    ])
  })

  it('does not let the caller’s order decide who owns a night', () => {
    expect(reminderWindows([1, 7])).toEqual(reminderWindows([7, 1]))
  })

  it('deduplicates and drops negatives, like the SQL’s DISTINCT and b >= 0', () => {
    expect(reminderWindows([7, 7, -3, 1, 1])).toEqual(reminderWindows([7, 1]))
  })

  it('floors a lone bucket at -1 so day 0 is inside it', () => {
    expect(reminderWindows([7])).toEqual([{ bucket: 7, floor: -1 }])
  })

  it('returns nothing for no buckets', () => {
    expect(reminderWindows([])).toEqual([])
  })
})

describe('jerusalemDaysRemaining', () => {
  it('counts Israeli calendar days, not 24-hour spans', () => {
    // 23:59:59 on the 13th minus 01:00 on the 6th is 7.95 days of clock time
    // and exactly 7 calendar days, which is the number the customer is told.
    expect(jerusalemDaysRemaining(expiring('2026-10-13'), RUN_NIGHT)).toBe(7)
  })

  it('reads 0 for a voucher that dies later tonight', () => {
    expect(jerusalemDaysRemaining(expiring('2026-10-06'), RUN_NIGHT)).toBe(0)
  })

  it('rolls the day over at Jerusalem midnight, not UTC midnight', () => {
    // 20:59:59Z is 23:59:59 IDT on the 5th; one second later it is the 6th in
    // Israel while still the 5th in UTC. The SQL casts in Asia/Jerusalem.
    const expires = expiring('2026-10-13')
    expect(jerusalemDaysRemaining(expires, new Date('2026-10-05T20:59:59Z'))).toBe(8)
    expect(jerusalemDaysRemaining(expires, new Date('2026-10-05T21:00:00Z'))).toBe(7)
  })

  it('survives the clocks going back (IDT ends 25.10.2026)', () => {
    // 24.10 23:00 IDT (UTC+3) to 31.10 end of day IST (UTC+2): seven calendar
    // days although the UTC span is 7 days and 2 hours short of a round week.
    expect(jerusalemDaysRemaining(expiring('2026-10-31'), new Date('2026-10-24T20:00:00Z'))).toBe(7)
  })
})

describe('reminderBucketFor, the selection query’s boundaries', () => {
  it('runs with the buckets the cron route passes', () => {
    expect(REMINDER_BUCKETS).toEqual([7, 1])
  })

  it.each([
    ['2026-10-14', 8, null],
    ['2026-10-13', 7, 7],
    ['2026-10-08', 2, 7],
    ['2026-10-07', 1, 1],
    ['2026-10-06', 0, 1],
  ])('expiring %s (%i days left) falls in bucket %s', (isoDate, days, bucket) => {
    const c = candidate({ expiresAt: expiring(isoDate) })
    expect(jerusalemDaysRemaining(c.expiresAt as Date, RUN_NIGHT)).toBe(days)
    expect(reminderBucketFor(c, RUN_NIGHT)).toBe(bucket)
  })

  it('puts day 7 inside the first window (<= bucket, not < bucket)', () => {
    expect(reminderBucketFor(candidate({ expiresAt: expiring('2026-10-13') }), RUN_NIGHT)).toBe(7)
  })

  it('keeps day 1 out of the first window (> floor, not >= floor)', () => {
    // Without the `+ 1` on the floor a one-day voucher matches both buckets
    // and the customer gets two reminders an instant apart.
    expect(reminderBucketFor(candidate({ expiresAt: expiring('2026-10-07') }), RUN_NIGHT)).toBe(1)
  })

  it('never returns two buckets for one night, whatever the buckets', () => {
    for (const isoDate of ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-13']) {
      const c = candidate({ expiresAt: expiring(isoDate) })
      const hits = reminderWindows([7, 1]).filter((w) => {
        const days = jerusalemDaysRemaining(c.expiresAt as Date, RUN_NIGHT)
        return days > w.floor && days <= w.bucket
      })
      expect(hits).toHaveLength(1)
    }
  })

  it('skips a voucher that is already past now(), even on the same calendar day', () => {
    // 00:30 on the 6th: the voucher died at 23:59:59 on the 5th. The sweep
    // owns it; a reminder about a dead coupon is the one message worse than
    // none.
    const c = candidate({ expiresAt: expiring('2026-10-05') })
    expect(reminderBucketFor(c, new Date('2026-10-05T21:30:00Z'))).toBeNull()
  })

  it('treats expires_at == now() as past (strict >)', () => {
    const at = new Date('2026-10-06T10:00:00Z')
    expect(reminderBucketFor(candidate({ expiresAt: at }), at)).toBeNull()
  })

  it('selects only issued rows', () => {
    for (const status of ['redeemed', 'expired', 'cancelled', 'refunded']) {
      expect(reminderBucketFor(candidate({ status }), RUN_NIGHT)).toBeNull()
    }
  })

  it('skips a voucher with no expiry', () => {
    expect(reminderBucketFor(candidate({ expiresAt: null }), RUN_NIGHT)).toBeNull()
  })

  it('skips a holder with no email address, as pr.email IS NOT NULL does', () => {
    expect(reminderBucketFor(candidate({ email: null }), RUN_NIGHT)).toBeNull()
    expect(reminderBucketFor(candidate({ email: '   ' }), RUN_NIGHT)).toBeNull()
  })

  it('with a lone bucket, reminds from day 7 down to day 0 and never at 8', () => {
    expect(
      reminderBucketFor(candidate({ expiresAt: expiring('2026-10-14') }), RUN_NIGHT, [7]),
    ).toBe(null)
    expect(
      reminderBucketFor(candidate({ expiresAt: expiring('2026-10-13') }), RUN_NIGHT, [7]),
    ).toBe(7)
    expect(
      reminderBucketFor(candidate({ expiresAt: expiring('2026-10-06') }), RUN_NIGHT, [7]),
    ).toBe(7)
  })

  it('selects nothing when there are no buckets', () => {
    expect(reminderBucketFor(candidate(), RUN_NIGHT, [])).toBeNull()
  })
})

describe('reminderDedupeKey', () => {
  it('is one key per voucher per bucket, the outbox’s UNIQUE column', () => {
    expect(reminderDedupeKey('v-1', 7)).toBe('voucher_expiring:v-1:7')
    expect(reminderDedupeKey('v-1', 1)).toBe('voucher_expiring:v-1:1')
    expect(reminderDedupeKey('v-1', 7)).not.toBe(reminderDedupeKey('v-2', 7))
  })

  it('is the same key on every night inside the window, so a re-select is a no-op', () => {
    const nights = ['2026-10-05T22:00:00Z', '2026-10-07T22:00:00Z', '2026-10-10T22:00:00Z']
    const keys = new Set(
      nights.map((n) => {
        const bucket = reminderBucketFor(candidate(), new Date(n))
        return bucket === null ? null : reminderDedupeKey('v-1', bucket)
      }),
    )
    expect([...keys]).toEqual(['voucher_expiring:v-1:7'])
  })
})
