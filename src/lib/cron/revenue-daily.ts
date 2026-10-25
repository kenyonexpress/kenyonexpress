/**
 * Helpers for the pg_cron job `ke-revenue-daily` (migrations/pending/289).
 * The job itself runs in the database; this is the app-side twin for a manual
 * backfill through `aggregate_daily_revenue(p_day)`.
 */

const _REVENUE_DAILY_JOB = 'ke-revenue-daily'

/** The calendar day (YYYY-MM-DD) before `now`, read on the Asia/Jerusalem clock. */
export function previousIsraelDay(now: Date): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
