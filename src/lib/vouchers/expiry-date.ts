/**
 * Turning `2026-10-31` typed into an admin form into the instant a coupon
 * actually stops working.
 *
 * =========================================================================
 * A DEADLINE IS THE END OF THE DAY, NOT THE START OF IT
 * =========================================================================
 *
 * `vouchers.expires_at` is a timestamptz and `redeem_voucher()` compares it to
 * `now()`. An operator extending a coupon "until the 31st" means the customer
 * can use it ON the 31st. Storing `2026-10-31T00:00:00` kills it at midnight as
 * the 31st begins -- the coupon is dead for the entire day the customer was
 * told they had, and the counter refuses them on precisely the date printed on
 * their screen. So a date maps to the last second of that day.
 *
 * =========================================================================
 * AND THE DAY IS ISRAEL'S, WHICH IS WHY THIS IS NOT ONE LINE
 * =========================================================================
 *
 * `new Date('2026-10-31')` is UTC midnight. Adding 23:59:59 to it gives UTC
 * end-of-day, which in Israel is 02:59 on 1 November in summer -- three free
 * hours -- and the naive local-time alternative is worse: this code runs in UTC
 * on Vercel and in Asia/Jerusalem on Ofir's machine, so a local-clock version
 * gives two different answers on the two machines and matches on neither. That
 * exact pair is why `lib/cabins/nights.ts` refuses to read a local zone at all.
 *
 * Israel is UTC+2 in winter and UTC+3 under IDT, and the changeover dates move.
 * Rather than encode them, the offset is READ from the platform's own tz
 * database through `Intl`, at the instant in question.
 *
 * TWO PASSES, BECAUSE THE OFFSET DEPENDS ON THE ANSWER. The offset that applies
 * at 23:59 on a date cannot be known before choosing an instant, and the naive
 * single pass is wrong on exactly the two nights a year the clocks move. So:
 * guess with the offset at midday UTC, then re-read the offset AT the candidate
 * instant and correct once. A second correction can never be needed, because a
 * DST shift is at most an hour and the candidate is already within an hour.
 */

const MINUTE_MS = 60_000

/** Minutes to ADD to UTC to get Jerusalem wall-clock time at `instant`. */
export function jerusalemOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at = (type: string): number => {
    const found = parts.find((p) => p.type === type)
    return found ? Number(found.value) : 0
  }

  // `hour` comes back as 24 for midnight under hour12:false in some engines.
  const hour = at('hour') % 24
  const wall = Date.UTC(at('year'), at('month') - 1, at('day'), hour, at('minute'), at('second'))
  return Math.round((wall - instant.getTime()) / MINUTE_MS)
}

/** `YYYY-MM-DD`, or null. Rejects `2026-13-40` as well as `banana`. */
export function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  // Round-trip through Date.UTC so 31 February is rejected rather than rolled
  // forward into March, which is what a component-wise range check would miss.
  const asUtc = new Date(Date.UTC(y, m - 1, d))
  if (asUtc.getUTCFullYear() !== y || asUtc.getUTCMonth() !== m - 1 || asUtc.getUTCDate() !== d) {
    return null
  }
  return { y, m, d }
}

/**
 * The last second of `YYYY-MM-DD` in Israel, as an instant.
 *
 * 23:59:59 and not 24:00:00: the next day's midnight is a different calendar
 * day, and a deadline stored as the start of the day after is the kind of
 * off-by-one that only shows up in the one second it is wrong.
 */
export function endOfJerusalemDay(isoDate: string): Date | null {
  const parsed = parseIsoDate(isoDate)
  if (!parsed) return null
  const { y, m, d } = parsed

  const wallEnd = Date.UTC(y, m - 1, d, 23, 59, 59)

  // Pass one: the offset at midday UTC on that date is right except across a
  // clock change.
  const guessOffset = jerusalemOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))
  const candidate = new Date(wallEnd - guessOffset * MINUTE_MS)

  // Pass two: re-read the offset where the answer actually lands.
  const trueOffset = jerusalemOffsetMinutes(candidate)
  if (trueOffset === guessOffset) return candidate
  return new Date(wallEnd - trueOffset * MINUTE_MS)
}

/** `2026-10-31` for a `<input type="date">`, in Israel's calendar. */
export function toJerusalemDateInput(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
  // en-CA formats as YYYY-MM-DD, which is what the input element wants.
  return parts
}
