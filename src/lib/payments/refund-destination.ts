import type { Database } from '@/types/database'

/**
 * Where a refunded shekel goes: the original card, or the site wallet.
 *
 * Consumer Protection Law (distance selling) gives 14 days to cancel and get
 * the money back to the original method. After that window a refund is still
 * possible as goodwill, but it is site credit: Cardcom's original-method
 * credit is not owed, and a wallet credit is the only movement the ledger
 * already knows how to reverse without inventing a new Cardcom call.
 *
 * A voucher that has already been consumed at the till is the same answer
 * even inside the 14 days. The value left the card and was spent; putting it
 * back on the card would refund consumed value. `planOrderRefund` already
 * refuses that card path; this function is the named destination for the
 * wallet path that replaces it.
 *
 * Same-day `CancelOnly` (Cardcom has not transmitted the batch) is NOT a
 * destination. It is a different operation in `planOrderRefund` and never
 * reaches this module.
 */

export type RefundDestination = Database['public']['Enums']['refund_destination']

/** Statutory cooling-off window, in Israel calendar days, inclusive of the charge day. */
export const DISTANCE_SALE_WINDOW_DAYS = 14

const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function israelDayStamp(at: Date): string {
  return ISRAEL_DAY.format(at)
}

/**
 * Whole calendar days from `from` to `to` on the Israel calendar.
 *
 * Compares YYYY-MM-DD stamps rather than elapsed hours, for the same reason
 * `isSameClearingDay` does: the cut is a calendar day, not a duration, and
 * DST would make a 24-hour window disagree with the day the customer reads
 * on the receipt.
 */
export function israelCalendarDaysBetween(from: Date, to: Date): number {
  const start = Date.parse(`${israelDayStamp(from)}T12:00:00Z`)
  const end = Date.parse(`${israelDayStamp(to)}T12:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

export function selectRefundDestination(input: {
  chargedAt: Date
  now: Date
  /** True when any voucher on the order is redeemed or expired. */
  voucherConsumed: boolean
}): RefundDestination {
  if (input.voucherConsumed) return 'wallet'
  const elapsed = israelCalendarDaysBetween(input.chargedAt, input.now)
  return elapsed <= DISTANCE_SALE_WINDOW_DAYS ? 'original_method' : 'wallet'
}
