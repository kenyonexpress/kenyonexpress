import { t } from '@/lib/i18n/messages'

/**
 * "N bought this week", and the rule for when the line may be said at all.
 *
 * THE RULE IS REAL DATA OR SILENCE. The count is units on orders that were
 * paid in the trailing seven days through a real charge: a `payments` row with
 * status `succeeded` whose provider id is not the mock's. Measured on
 * 2026-09-25, production held 18 paid orders in the trailing week and every one
 * of them was a mock-provider rehearsal; the naive count would have put
 * "18 bought this week" on two product pages that nobody had bought. Refunded
 * and cancelled orders are out for the same reason: they are not demand.
 *
 * THE FLOOR IS A DISPLAY DECISION, NOT A NUMBER. Below it the line is absent,
 * never rounded up, never "a few". "1 bought this week" is true and reads as
 * a warning, so the floor is where the sentence starts to mean what a shopper
 * takes it to mean. Israeli consumer law limits urgency claims to ones the
 * seller can substantiate; a count read from paid orders is one.
 */
export const BOUGHT_THIS_WEEK_FLOOR = 3

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The order states in which money was taken and not given back. */
export const PAID_ORDER_STATUSES = [
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'platform_settled',
] as const

export type PaidOrderStatus = (typeof PAID_ORDER_STATUSES)[number]

/** Start of the trailing window, ISO, for the `paid_at >= ?` predicate. */
export function weekWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - WEEK_MS).toISOString()
}

/**
 * Units on the given items whose order is backed by a real charge. The item
 * list already carries only paid-window orders; `realOrderIds` is the set of
 * orders with a succeeded, non-mock payment. Quantities that are not positive
 * integers are dropped rather than trusted.
 */
export function sumRealUnits(
  items: ReadonlyArray<{ order_id: string; quantity: number }>,
  realOrderIds: ReadonlySet<string>,
): number {
  let total = 0
  for (const item of items) {
    if (!realOrderIds.has(item.order_id)) continue
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) continue
    total += item.quantity
  }
  return total
}

/** The Hebrew line, or null when the count is under the floor. */
export function boughtThisWeekMessage(count: number): string | null {
  if (!Number.isInteger(count) || count < BOUGHT_THIS_WEEK_FLOOR) return null
  return t('pdp.boughtThisWeek').replace('{count}', String(count))
}
