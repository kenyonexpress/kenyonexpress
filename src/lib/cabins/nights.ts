/**
 * What a stay costs, night by night.
 *
 * =========================================================================
 * DATES ARE STRINGS AND THE ARITHMETIC IS IN UTC, DELIBERATELY
 * =========================================================================
 *
 * A booking night is a CALENDAR date, not an instant. `new Date('2026-10-02')`
 * parses as UTC midnight, and in a runtime whose local zone is behind UTC that
 * is the evening of the 1st - so `getDay()` returns the wrong weekday and a
 * Friday is priced as a Thursday. The server runs in UTC on Vercel and in
 * Asia/Jerusalem on this machine, which is exactly the pair that makes the bug
 * appear on one and not the other.
 *
 * So every function here takes and returns `YYYY-MM-DD`, and every step of the
 * arithmetic goes through `Date.UTC`. Nothing in this file reads a local clock
 * or a local zone.
 *
 * =========================================================================
 * THE ISRAELI WEEKEND IS FRIDAY AND SATURDAY
 * =========================================================================
 *
 * `getUTCDay()`: 5 is Friday, 6 is Saturday. That does not move, so it is
 * computed rather than configured.
 *
 * HOLIDAYS ARE NOT COMPUTED. Jewish holidays follow a lunisolar calendar and
 * fall on different Gregorian dates every year. Hard-coding a list here would
 * be writing dates this file cannot verify, and a wrong date is a wrong price
 * on the busiest night of the year. `cabin_holidays` is a table the operator
 * fills and the caller passes in.
 */

export type IsoDate = string

export type NightKind = 'weekday' | 'weekend' | 'holiday'

export interface NightRate {
  date: IsoDate
  kind: NightKind
  priceAgorot: number
  /** Which rate row decided the price, for a breakdown the guest can read. */
  source: 'base' | 'weekend' | 'holiday' | 'range'
}

export interface RateCard {
  baseAgorot: number
  weekendAgorot?: number | null
  holidayAgorot?: number | null
  /** Season and event prices. Half-open, like the booking's own range. */
  ranges?: readonly { from: IsoDate; to: IsoDate; priceAgorot: number }[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y as number, (m as number) - 1, d as number)
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

const DAY_MS = 86_400_000

/**
 * The nights in a stay: check-in inclusive, check-out EXCLUSIVE.
 *
 * That matches `daterange`'s half-open form and it is the whole reason a guest
 * arriving on the 5th does not collide with one leaving that morning. A stay
 * from the 1st to the 5th is four nights: 1, 2, 3, 4.
 *
 * An empty or backwards range is no nights, not an error: the caller has
 * already been refused by `cabin_bookings_stay_not_empty`, and throwing here
 * would turn a validation problem into a 500.
 */
export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
  if (!ISO.test(checkIn) || !ISO.test(checkOut)) return []
  const start = toUtc(checkIn)
  const end = toUtc(checkOut)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []

  const out: IsoDate[] = []
  for (let ms = start; ms < end; ms += DAY_MS) out.push(fromUtc(ms))
  return out
}

/** Friday or Saturday. See the header on why this is computed and holidays are not. */
export function isIsraeliWeekend(date: IsoDate): boolean {
  if (!ISO.test(date)) return false
  const day = new Date(toUtc(date)).getUTCDay()
  return day === 5 || day === 6
}

/**
 * A night's kind. HOLIDAY BEATS WEEKEND when a holiday falls on a Friday, which
 * most of them do at least once. Pricing it as an ordinary weekend on the
 * busiest night of the year is the mistake this ordering exists to prevent.
 */
export function nightKind(date: IsoDate, holidays: ReadonlySet<IsoDate>): NightKind {
  if (holidays.has(date)) return 'holiday'
  return isIsraeliWeekend(date) ? 'weekend' : 'weekday'
}

/**
 * The price for one night.
 *
 * A DATED RANGE WINS OVER EVERYTHING, including a holiday. A season price is
 * the operator saying "in this window, this is the price" - if they wanted the
 * holiday rate inside it they would not have set the range. The most specific
 * statement wins, which is the only ordering that lets an operator override
 * anything.
 *
 * A missing weekend or holiday price falls through to the base. That is not a
 * gap: it is an operator who has not distinguished them, and charging the base
 * is what they configured.
 */
export function nightPrice(
  date: IsoDate,
  kind: NightKind,
  rates: RateCard,
): { priceAgorot: number; source: NightRate['source'] } {
  const inRange = (rates.ranges ?? []).find((r) => date >= r.from && date < r.to)
  if (inRange) return { priceAgorot: inRange.priceAgorot, source: 'range' }

  if (kind === 'holiday' && rates.holidayAgorot != null) {
    return { priceAgorot: rates.holidayAgorot, source: 'holiday' }
  }
  if (kind === 'weekend' && rates.weekendAgorot != null) {
    return { priceAgorot: rates.weekendAgorot, source: 'weekend' }
  }
  return { priceAgorot: rates.baseAgorot, source: 'base' }
}

export interface StayQuote {
  nights: NightRate[]
  totalAgorot: number
}

/**
 * The whole stay, priced.
 *
 * Integer agorot throughout, summed with `+` on integers. Nothing here divides
 * or multiplies by a float, which is the rule `lib/money.ts` sets for the whole
 * money path.
 */
export function quoteStay(
  checkIn: IsoDate,
  checkOut: IsoDate,
  rates: RateCard,
  holidays: ReadonlySet<IsoDate> = new Set(),
): StayQuote {
  const nights = nightsBetween(checkIn, checkOut).map((date) => {
    const kind = nightKind(date, holidays)
    const { priceAgorot, source } = nightPrice(date, kind, rates)
    return { date, kind, priceAgorot, source }
  })

  return {
    nights,
    totalAgorot: nights.reduce((sum, night) => sum + night.priceAgorot, 0),
  }
}

/**
 * Whether a guest may still cancel without a charge.
 *
 * `freeDays` before CHECK-IN, compared on calendar dates rather than on
 * instants: "14 days before" is a date, and comparing timestamps would make the
 * answer depend on the hour somebody clicked.
 *
 * The boundary is inclusive. A guest cancelling exactly on the last day is
 * inside the window, because a rule a customer reads as "up to 14 days before"
 * has to include the fourteenth.
 */
export function withinFreeCancellation(
  today: IsoDate,
  checkIn: IsoDate,
  freeDays: number,
): boolean {
  if (!ISO.test(today) || !ISO.test(checkIn)) return false
  const daysUntil = Math.round((toUtc(checkIn) - toUtc(today)) / DAY_MS)
  return daysUntil >= freeDays
}
