import {
  MAX_CHARGE_ATTEMPTS,
  canPause,
  canResume,
  dueSubscriptions,
  pauseUpdate,
  resumeUpdate,
} from '@/lib/commerce/recurring'
import { describe, expect, it } from 'vitest'

/**
 * Pause and resume ([90]).
 *
 * `paused` has been a permitted status since 135b and nothing could set it: the
 * database CHECK allows it, `dueSubscriptions` skips it, `canCancel` accepts
 * it, and the only exported action was cancel.
 *
 * The two assertions that matter most are the ones about what a RESUME does,
 * because both of its rules are load-bearing and neither is obvious.
 */

const NOW = '2026-09-09T12:00:00.000Z'

function billable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'active',
    cardcom_token: 'tok',
    failed_attempts: 0,
    next_charge_at: '2026-09-01T12:00:00.000Z',
    billing_interval: 'monthly',
    billing_interval_count: 1,
    ...overrides,
  } as never
}

describe('canPause and canResume', () => {
  it('pauses a live subscription and refuses a finished one', () => {
    expect(canPause('active')).toBe(true)
    expect(canPause('past_due')).toBe(true)
    expect(canPause('paused')).toBe(false)
    expect(canPause('canceled')).toBe(false)
  })

  it('resumes only from paused', () => {
    expect(canResume('paused')).toBe(true)
    expect(canResume('active')).toBe(false)
    expect(canResume('canceled')).toBe(false)
  })
})

describe('pauseUpdate', () => {
  it('keeps next_charge_at rather than clearing it', () => {
    // `dueSubscriptions` already refuses any status that is not active or
    // past_due, so a stale date on a paused row can never be charged. Keeping
    // it is what lets support see which cycle the customer stopped on, and it
    // is what keeps `paused` distinguishable from `canceled` in the database.
    expect(pauseUpdate({ next_charge_at: '2026-09-01T12:00:00.000Z' })).toEqual({
      status: 'paused',
      next_charge_at: '2026-09-01T12:00:00.000Z',
    })
  })

  it('a paused row is never billable, whatever its date says', () => {
    const overdue = billable({ status: 'paused', next_charge_at: '2020-01-01T00:00:00.000Z' })
    expect(dueSubscriptions([overdue], NOW)).toEqual([])
  })
})

describe('resumeUpdate', () => {
  it('starts a fresh cycle from now, not from the paused date', () => {
    // Restoring the stored date would charge the customer the instant they
    // resume, for a period they spent paused. That is the one thing a pause
    // button must not do.
    const update = resumeUpdate({ nowIso: NOW, interval: 'monthly' })
    expect(update.status).toBe('active')
    expect(new Date(update.next_charge_at).getTime()).toBeGreaterThan(new Date(NOW).getTime())
  })

  it('resets failed_attempts, or the subscription would look alive and never charge', () => {
    // `dueSubscriptions` refuses any row at or past MAX_CHARGE_ATTEMPTS. A
    // subscription resumed from past_due with three failures behind it would
    // read as `active` in the customer's account and be skipped by every run -
    // worse than either state it came from, because nothing reports it.
    expect(resumeUpdate({ nowIso: NOW, interval: 'monthly' }).failed_attempts).toBe(0)
  })

  it('and that reset is what makes the resumed row billable again', () => {
    const exhausted = billable({
      status: 'past_due',
      failed_attempts: MAX_CHARGE_ATTEMPTS,
      next_charge_at: '2026-09-01T12:00:00.000Z',
    })
    expect(dueSubscriptions([exhausted], NOW)).toEqual([])

    const update = resumeUpdate({ nowIso: NOW, interval: 'monthly' })
    const resumed = billable({
      status: update.status,
      failed_attempts: update.failed_attempts,
      next_charge_at: '2026-09-01T12:00:00.000Z',
    })
    expect(dueSubscriptions([resumed], NOW)).toHaveLength(1)
  })

  it('honours a yearly interval and a multi-period count', () => {
    const monthly = resumeUpdate({ nowIso: NOW, interval: 'monthly' })
    const yearly = resumeUpdate({ nowIso: NOW, interval: 'yearly' })
    expect(new Date(yearly.next_charge_at).getTime()).toBeGreaterThan(
      new Date(monthly.next_charge_at).getTime(),
    )
    const twoMonths = resumeUpdate({ nowIso: NOW, interval: 'monthly', intervalCount: 2 })
    expect(new Date(twoMonths.next_charge_at).getTime()).toBeGreaterThan(
      new Date(monthly.next_charge_at).getTime(),
    )
  })
})
