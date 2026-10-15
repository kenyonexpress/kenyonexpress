/**
 * Scheduled gift delivery.
 *
 * The buyer picks a calendar date; the email goes out at 06:00 UTC that day
 * (08:00 or 09:00 in Israel depending on DST). A date that is today, in the past,
 * malformed or more than a year away means "send now", which is the behaviour
 * before scheduling existed, so a bad value can only make a gift earlier.
 */
const MAX_DAYS_AHEAD = 365
const DAY_MS = 86_400_000

export function giftSendAt(dateText: string | null | undefined, now: Date): Date | null {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null
  const at = new Date(`${dateText}T06:00:00.000Z`)
  if (Number.isNaN(at.getTime())) return null
  // Round-trip guard: 2026-02-31 parses in some engines as March 3.
  if (at.toISOString().slice(0, 10) !== dateText) return null
  const ahead = at.getTime() - now.getTime()
  if (ahead <= 0 || ahead > MAX_DAYS_AHEAD * DAY_MS) return null
  return at
}
