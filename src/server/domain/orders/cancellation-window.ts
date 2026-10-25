import type { RefundGround } from '@/server/payments/refund-record'
import { STATUTORY_CANCELLATION_WINDOW_DAYS } from './refund-request'

/**
 * The per-product cancellation window (migration 185) on top of the statute.
 *
 * THE STATUTE IS THE FLOOR, NOT A DEFAULT WE MAY LOWER. Section 14ה gives the
 * customer 14 days whatever the product says, so a product row holding 7 still
 * gets 14. A product holding 30 GRANTS 16 more days, and those extra days are
 * ours to give: a cancellation inside them is ground `extended_window`, which
 * `refundDestinationFor` already sends to the wallet and which carries no fee.
 * A statutory cancellation keeps going back to the card with the statutory fee.
 *
 * An order with several products takes the SHORTEST window among them: the
 * order is cancelled as a whole, and the most generous product cannot extend
 * the promise every other product made.
 */

const MS_PER_DAY = 86_400_000

export function effectiveCancellationWindowDays(
  productWindows: readonly (number | null | undefined)[],
): number {
  const days = productWindows.map((d) =>
    typeof d === 'number' && Number.isFinite(d)
      ? Math.trunc(d)
      : STATUTORY_CANCELLATION_WINDOW_DAYS,
  )
  const shortest = days.length > 0 ? Math.min(...days) : STATUTORY_CANCELLATION_WINDOW_DAYS
  return Math.max(STATUTORY_CANCELLATION_WINDOW_DAYS, shortest)
}

function daysSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / MS_PER_DAY
}

/**
 * Which ground a customer's own cancel button files under.
 *
 * Inside 14 days, or with no payment date to measure from: the statutory
 * ground, so nothing is decided against the customer on a date we do not
 * hold. Past 14 but inside the product's window: `extended_window`. Past both:
 * still the statutory ground, which the decision demotes to a person
 * (`window_closed`) rather than refusing.
 */
export function customerCancellationGround(
  paidAt: Date | undefined,
  now: Date,
  windowDays: number,
): RefundGround {
  if (!paidAt) return 'distance_sale_14d'
  const elapsed = daysSince(paidAt, now)
  if (elapsed <= STATUTORY_CANCELLATION_WINDOW_DAYS) return 'distance_sale_14d'
  if (elapsed <= windowDays) return 'extended_window'
  return 'distance_sale_14d'
}

/** The last moment the customer can still cancel, for display. */
export function cancellationDeadline(paidAt: Date, windowDays: number): Date {
  return new Date(paidAt.getTime() + windowDays * MS_PER_DAY)
}
