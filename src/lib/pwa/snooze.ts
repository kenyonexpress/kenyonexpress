/**
 * "Not now" for a nudge: hidden for thirty days, then offered again.
 *
 * ONE RULE FOR THREE PROMPTS. The passkey dialog on /account, the push
 * invitation on the order confirmation and the first-purchase banner each used
 * to keep their own seen-flag, and each was PERMANENT: one "not now" and the
 * customer was never asked again, on that device, ever. Q17 asks for a
 * thirty-day dismissal instead, and the same helper serves all three so the
 * window cannot drift between them.
 *
 * THE STORED VALUE IS THE INSTANT THE SNOOZE ENDS, in epoch milliseconds, and
 * not the instant it started. Reading it is a comparison with the clock and
 * nothing else; the window length lives in exactly one place, here, and an
 * older record keeps meaning what it meant when it was written. A legacy `'1'`
 * (the old permanent flag) does not parse and so counts as NOT snoozed: the
 * customer who dismissed under the old rule is asked once more and from then
 * on gets the thirty-day window, which is the rule this item introduces.
 *
 * `localStorage` AND NOT A COOKIE OR A COLUMN, for the same reason the three
 * prompts already chose it: a passkey, a push subscription and a notification
 * permission are all per device, so the "not now" that stands for them is too.
 */

export const SNOOZE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** Minimal surface of `Storage`, so a test can pass a Map-backed stand-in. */
export interface SnoozeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** When a snooze that starts at `now` ends. */
export function snoozeEndsAt(now: number, days: number = SNOOZE_DAYS): number {
  return now + days * DAY_MS
}

/**
 * Is a stored value still in force at `now`? Anything that is not a finite
 * positive number is treated as "no snooze": that covers the empty slot, the
 * legacy `'1'` flag, and a hand-edited value.
 */
export function isSnoozed(stored: string | null | undefined, now: number): boolean {
  if (stored === null || stored === undefined || stored === '') return false
  if (!/^\d+$/.test(stored)) return false
  const until = Number(stored)
  if (!Number.isFinite(until) || until <= 0) return false
  return now < until
}

function storage(): SnoozeStorage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    // Private mode, or storage blocked outright. Both prompts already treat
    // this as "ask": the worst case is a second question, and the alternative
    // is a customer who can never be told their parcel shipped.
    return null
  }
}

/** Read the snooze under `key`; a missing or unreadable store means "not snoozed". */
export function readSnooze(
  key: string,
  now: number,
  store: SnoozeStorage | null = storage(),
): boolean {
  if (!store) return false
  try {
    return isSnoozed(store.getItem(key), now)
  } catch {
    return false
  }
}

/** Start a `days`-long snooze under `key` at `now`. Silently a no-op without storage. */
export function writeSnooze(
  key: string,
  now: number,
  store: SnoozeStorage | null = storage(),
  days: number = SNOOZE_DAYS,
): void {
  if (!store) return
  try {
    store.setItem(key, String(snoozeEndsAt(now, days)))
  } catch {
    // Same reasoning as `storage()`: showing it again is the better failure.
  }
}
