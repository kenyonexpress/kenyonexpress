import type { PayoutBreakdownLine } from '@/lib/supplier/dashboard'

/**
 * One calendar month of a supplier's settlement, as a document rather than a
 * screen.
 *
 * WHY MONTHLY, AND WHY THAT IS NOT WHAT EXISTED
 *
 * `/api/supplier/payouts/csv` already exports the settlement breakdown, and it
 * exports ALL OF IT -- every line the supplier has ever sold, in one file,
 * every time. That is the right shape for "let me look at everything" and the
 * wrong one for the thing a supplier actually needs, which is a statement they
 * can hand to a bookkeeper alongside one month's invoice.
 *
 * Israeli bookkeeping runs on the calendar month: VAT is filed monthly or
 * bi-monthly, and a supplier reconciling their books needs "what did
 * KenyonExpress owe me for September" as its own artefact with its own total.
 *
 * THE MONTH IS ISRAELI, NOT UTC
 *
 * A sale at 01:30 on 1 October Israeli time is 22:30 on 30 September in UTC,
 * and filing it under September puts it in a month the supplier has already
 * closed. Everything here goes through `israelMonth`, the same helper the
 * settlement report uses, so the two cannot disagree about which month a sale
 * belongs to.
 *
 * IT FILTERS ON `paidAt`, NOT ON WHEN THE ORDER WAS PLACED
 *
 * The statement is about money, and money moves when the payment settles. An
 * order placed on 30 September and paid on 2 October belongs to October, which
 * is where the bank will show it.
 *
 * Pure: no database, no clock beyond what is passed in.
 */

/** `YYYY-MM` in Asia/Jerusalem, or null for a date that cannot be read. */
export function israelMonthOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
  })
    .format(parsed)
    .slice(0, 7)
}

/** `YYYY-MM`, rejecting anything else rather than guessing. */
export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export interface SettlementStatement {
  month: string
  supplierName: string
  lines: PayoutBreakdownLine[]
  grossAgorot: number
  platformFeeAgorot: number
  supplierPayoutAgorot: number
  /** Lines whose money has actually been settled, of the lines listed. */
  settledCount: number
}

/**
 * Build the statement for one month.
 *
 * A line with no `paidAt` is EXCLUDED, not filed under the current month. An
 * unpaid line is money that has not moved, and putting it in a month's
 * statement would have the supplier reconcile against a bank transfer that
 * never happened. It stays in the all-time CSV, where it is visible as pending.
 */
export function buildSettlementStatement(input: {
  month: string
  supplierName: string
  lines: readonly PayoutBreakdownLine[]
}): SettlementStatement {
  if (!isMonthKey(input.month)) {
    throw new RangeError(`month must be YYYY-MM (got "${input.month}")`)
  }

  const lines = input.lines.filter((line) => israelMonthOf(line.paidAt) === input.month)

  // Integer agorot throughout. Every input is already an integer count of
  // agorot, so the totals are exact sums and no rounding happens on this path.
  let grossAgorot = 0
  let platformFeeAgorot = 0
  let supplierPayoutAgorot = 0
  let settledCount = 0
  for (const line of lines) {
    grossAgorot += line.grossAgorot
    platformFeeAgorot += line.platformFeeAgorot
    supplierPayoutAgorot += line.supplierPayoutAgorot
    if (line.settlementStatus === 'settled' || line.settlementStatus === 'paid') settledCount++
  }

  return {
    month: input.month,
    supplierName: input.supplierName,
    lines,
    grossAgorot,
    platformFeeAgorot,
    supplierPayoutAgorot,
    settledCount,
  }
}

/**
 * Which months this supplier has anything in, newest first.
 *
 * Offered to the UI so the month picker lists months that EXIST rather than a
 * rolling twelve, most of which would be empty for a supplier who joined last
 * week and download as a blank statement.
 */
export function monthsWithActivity(lines: readonly PayoutBreakdownLine[]): string[] {
  const months = new Set<string>()
  for (const line of lines) {
    const month = israelMonthOf(line.paidAt)
    if (month) months.add(month)
  }
  return [...months].sort().reverse()
}
