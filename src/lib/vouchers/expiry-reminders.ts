import { toJerusalemDateInput } from '@/lib/vouchers/expiry-date'

/**
 * The expiry reminder's selection rule, in TypeScript, so its edges can be
 * tested without a database.
 *
 * THE RULE LIVES IN SQL. `enqueue_expiring_voucher_notices(integer[])`
 * (production; window form in `migrations/pending/227_voucher_expiry_engine.sql`)
 * decides which vouchers are reminded tonight. Nothing here is called by the
 * cron route. This file restates that rule line for line so that the one
 * question the SQL cannot cheaply answer in a test -- "which bucket does a
 * voucher with N days left fall in, and what happens at N = 0, 1, 7 and 8" --
 * has a pinned answer, and so that the pins in
 * `src/__tests__/expiry-reminders-schedule.test.ts` can hold the SQL text to
 * the same expressions.
 *
 * THE RULE, as 227 states it:
 *
 *   - only `status = 'issued'` rows with an `expires_at`;
 *   - only rows whose holder has an email (the outbox row is addressed to it;
 *     push and the in-app bell ride the same row through `user_id`);
 *   - never a row already past `now()` -- the sweep runs first in the same
 *     request and this only catches one that died between the two statements;
 *   - `days_remaining` is the difference of two JERUSALEM calendar dates, not
 *     of two instants: a coupon that dies at 23:59 tonight has 0 days left at
 *     01:00, not 0.95;
 *   - buckets are sorted descending and each owns the half-open range down to
 *     the next one: `[7, 1]` means bucket 7 is `1 < days <= 7` and bucket 1 is
 *     `-1 < days <= 1`, so a voucher-night belongs to exactly one bucket and a
 *     voucher issued with one day of life is not mailed twice an instant apart;
 *   - the dedupe key is `voucher_expiring:<voucher_id>:<bucket>`, UNIQUE in
 *     `notification_outbox`, which is what makes re-selecting the same voucher
 *     every night inside its window enqueue at most one row per bucket.
 *
 * The live function still matches ONE exact day (`date = today + bucket`);
 * 227 widens it to the window. The window is what this file mirrors, because
 * the exact-day form is the bug: a dropped nightly run loses that bucket's
 * reminder for good.
 */

/** What `/api/cron/expire-vouchers` passes as `p_buckets`. */
export const REMINDER_BUCKETS: readonly number[] = [7, 1]

export interface ReminderWindow {
  /** The bucket's name and its inclusive upper edge, in days remaining. */
  bucket: number
  /** Exclusive lower edge: the next bucket down, or -1 for the last one. */
  floor: number
}

/**
 * Descending, deduplicated, negatives and non-integers dropped, each bucket
 * floored by the next. The caller's order must not decide who owns a night.
 */
export function reminderWindows(buckets: readonly number[]): ReminderWindow[] {
  const sorted = [...new Set(buckets.filter((b) => Number.isInteger(b) && b >= 0))].sort(
    (a, b) => b - a,
  )
  return sorted.map((bucket, i) => ({
    bucket,
    floor: i < sorted.length - 1 ? (sorted[i + 1] as number) : -1,
  }))
}

const DAY_MS = 86_400_000

function dayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS)
}

/**
 * `(expires_at AT TIME ZONE 'Asia/Jerusalem')::date - (now() AT TIME ZONE
 * 'Asia/Jerusalem')::date`: whole Israeli calendar days, DST read from the tz
 * database the way `expiry-date.ts` does, never from the machine's zone.
 */
export function jerusalemDaysRemaining(expiresAt: Date, now: Date): number {
  return dayNumber(toJerusalemDateInput(expiresAt)) - dayNumber(toJerusalemDateInput(now))
}

export interface ReminderCandidate {
  id: string
  status: string
  expiresAt: Date | null
  /** The holder's profile email. `null` is what `pr.email IS NOT NULL` excludes. */
  email: string | null
}

/**
 * The bucket this voucher is enqueued under tonight, or `null` when the
 * selection would not return it at all.
 */
export function reminderBucketFor(
  candidate: ReminderCandidate,
  now: Date,
  buckets: readonly number[] = REMINDER_BUCKETS,
): number | null {
  if (candidate.status !== 'issued') return null
  if (!candidate.expiresAt) return null
  // `fn_enqueue_notification` also returns quietly for a blank address, so a
  // blank is as excluded as a NULL once the row reaches the outbox.
  if (!candidate.email || candidate.email.trim() === '') return null
  if (candidate.expiresAt.getTime() <= now.getTime()) return null

  const days = jerusalemDaysRemaining(candidate.expiresAt, now)
  for (const window of reminderWindows(buckets)) {
    if (days > window.floor && days <= window.bucket) return window.bucket
  }
  return null
}

/** `voucher_expiring:<id>:<bucket>`, the outbox's UNIQUE key for this reminder. */
export function reminderDedupeKey(voucherId: string, bucket: number): string {
  return `voucher_expiring:${voucherId}:${bucket}`
}
