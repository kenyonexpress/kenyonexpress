// scripts/seed/lib/clock.mjs
//
// One clock for the whole run.
//
// Demo data is full of relative dates: an order paid 12 days ago, a voucher
// that expired yesterday, an offer valid for another 60 days. If each data file
// called new Date() itself, two runs would produce different rows and a run
// that straddles midnight would produce internally inconsistent ones. So the
// run stamps `now` once, at startup, and every relative date is derived from
// that instant.
//
// --now=<iso> pins it, which is what the tests use to get byte-identical output
// from two runs on different days.

export function createClock(nowIso) {
  const now = nowIso ? new Date(nowIso) : new Date()
  if (Number.isNaN(now.getTime())) {
    throw new TypeError(`--now is not a valid ISO instant: ${nowIso}`)
  }

  const shift = (days, hours = 0) =>
    new Date(now.getTime() + days * 86_400_000 + hours * 3_600_000)

  return {
    now,
    iso: () => now.toISOString(),
    /** Days in the past, as an ISO string. daysAgo(3) is three days before `now`. */
    daysAgo: (days, hours = 0) => shift(-days, -hours).toISOString(),
    /** Days in the future, as an ISO string. */
    daysAhead: (days, hours = 0) => shift(days, hours).toISOString(),
    /** Same, as Date objects, for the callers that do arithmetic on them. */
    dateAgo: (days, hours = 0) => shift(-days, -hours),
    dateAhead: (days, hours = 0) => shift(days, hours),
  }
}
