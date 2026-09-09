/**
 * When the parcel is expected, counted the way the site already promises it.
 *
 * THE PROMISE IS ALREADY WRITTEN DOWN, IN TWO PLACES, AND THIS OBEYS BOTH
 *
 * `terms.ts` 181: "זמני האספקה ... נמנים בימי עסקים (ראשון עד חמישי, למעט ערבי
 * חג, חגים וימי שבתון), החל מיום אישור העסקה על ידי חברת האשראי."
 * `wp-migrated.ts` 367 adds the part that decides the arithmetic: business days
 * "אינם כוללים את יום ביצוע ההזמנה" -- the day of the order does not count.
 *
 * So the count starts the day AFTER the payment was approved, and only Sunday
 * through Thursday count. Both rules are the site's own text; this module does
 * not introduce a policy, it makes an existing one computable.
 *
 * HOLIDAYS ARE NOT MODELLED, AND THAT IS STATED RATHER THAN HIDDEN
 *
 * The terms exclude ערבי חג, חגים and ימי שבתון too. There is no holiday
 * calendar anywhere in this system -- no table, no library, nothing (measured
 * 2026-09-10 against production and the repo). Hard-coding Hebrew-calendar
 * dates here would be a second source of truth that silently rots one year
 * later, and a delivery estimate that is confidently wrong in Tishrei is worse
 * than one the customer knows is approximate. So `holidaysModelled` is exported
 * as `false` and the UI says "הערכה" beside the range. When a calendar exists,
 * this is the one place that changes.
 *
 * THE WINDOW IS A RANGE, NOT A DATE
 *
 * The product page promises 3-7 business days. A single date reads as a
 * commitment and generates a support ticket the moment it slips by an hour. The
 * range is what was promised, so the range is what is shown.
 */

/** Sunday .. Thursday are working days in Israel. Friday=5, Saturday=6. */
const WEEKEND = new Set([5, 6])

/** The promise printed on the product page. */
export const MIN_BUSINESS_DAYS = 3
export const MAX_BUSINESS_DAYS = 7

/**
 * False until a Hebrew-calendar source exists. Exported so a test can assert
 * that the UI is still saying "estimate" rather than "arrives on".
 */
export const holidaysModelled = false

export interface DeliveryEstimate {
  /** ISO date (YYYY-MM-DD) of the earliest expected day. */
  fromDate: string
  /** ISO date of the latest expected day. */
  toDate: string
  /** Hebrew range, already formatted for display. */
  labelHe: string
  /** True once `toDate` is in the past and nothing has been delivered. */
  overdue: boolean
}

function isWeekend(date: Date): boolean {
  return WEEKEND.has(date.getUTCDay())
}

/**
 * Adds N business days, never counting the starting day itself. Pure UTC
 * arithmetic: Israel is UTC+2/+3 and a date that crosses midnight either way
 * moves the estimate by at most one day, which is inside a four-day window --
 * whereas a timezone library here would be a dependency for nothing.
 */
export function addBusinessDays(start: Date, days: number): Date {
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  let remaining = days
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (!isWeekend(cursor)) remaining -= 1
  }
  return cursor
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const MONTHS_HE = [
  'בינואר',
  'בפברואר',
  'במרץ',
  'באפריל',
  'במאי',
  'ביוני',
  'ביולי',
  'באוגוסט',
  'בספטמבר',
  'באוקטובר',
  'בנובמבר',
  'בדצמבר',
]

function hebrewDay(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS_HE[date.getUTCMonth()]}`
}

export interface EstimateInput {
  /** When the card was approved. Null means the order is not paid yet. */
  paidAt: string | null
  /** Already delivered? Then there is nothing to estimate. */
  delivered: boolean
  /** Evaluation time, injected so the result is testable. */
  now: Date
}

/**
 * Null when there is nothing to promise: an unpaid order has not started the
 * clock, and a delivered one has arrived.
 */
export function estimateDelivery(input: EstimateInput): DeliveryEstimate | null {
  if (input.delivered) return null
  if (!input.paidAt) return null

  const paid = new Date(input.paidAt)
  if (Number.isNaN(paid.getTime())) return null

  const from = addBusinessDays(paid, MIN_BUSINESS_DAYS)
  const to = addBusinessDays(paid, MAX_BUSINESS_DAYS)

  return {
    fromDate: isoDate(from),
    toDate: isoDate(to),
    labelHe: `${hebrewDay(from)} עד ${hebrewDay(to)}`,
    overdue: isoDate(input.now) > isoDate(to),
  }
}
