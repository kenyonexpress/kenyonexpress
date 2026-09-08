/**
 * The two rates STEP 19 names and the analytics page did not show.
 *
 * A rate is a division, and the only way to get one wrong that nobody notices
 * is the denominator. Both are stated here rather than buried in a query, and
 * both are argued.
 *
 * ZERO DENOMINATOR RETURNS null, NEVER 0. A dashboard that prints "0% refunds"
 * for a window with no orders is not reporting a good month, it is reporting
 * nothing while looking like it reported something. That is the failure this
 * codebase keeps finding in other shapes - a mechanism that answers
 * successfully while measuring nothing - and a KPI tile is the last place it
 * should be allowed. The caller renders a dash.
 */

export interface Rate {
  /** 0..1, or null when the denominator is zero and there is nothing to divide. */
  value: number | null
  numerator: number
  denominator: number
}

function rate(numerator: number, denominator: number): Rate {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return { value: null, numerator, denominator: Math.max(0, denominator) }
  }
  return { value: numerator / denominator, numerator, denominator }
}

/**
 * Refunded orders over PAID orders.
 *
 * The denominator is paid orders and not all orders, because an order that was
 * never paid cannot be refunded - counting abandoned checkouts underneath would
 * make the rate fall whenever traffic rose, which is the opposite of what the
 * number is for.
 *
 * `refunded` is a terminal `order_status` that REPLACES `paid`, and `paid_at`
 * survives the transition, so a refunded order is still inside its own
 * denominator. Both counts therefore come from the same window on `paid_at`.
 */
export function refundRate(input: { paidOrders: number; refundedOrders: number }): Rate {
  return rate(input.refundedOrders, input.paidOrders)
}

/**
 * Redeemed vouchers over REDEEMABLE vouchers.
 *
 * Read from `vouchers.redeemed_at` and `vouchers.status`, deliberately NOT by
 * counting `voucher_redemptions`. That table records refusals as well as
 * successes - a forged token, another supplier's code, an already-used code -
 * so counting its rows would put failed scan attempts in the numerator of a
 * success rate.
 *
 * `cancelled` and `refunded` vouchers are removed from the denominator. They
 * were withdrawn rather than left unredeemed, and holding them against the
 * rate would mean a generous refund policy looked like poor redemption.
 * `expired` stays in: an expired voucher IS an unredeemed one, and that is
 * exactly what this number is meant to expose.
 */
export function redemptionRate(input: {
  issued: number
  redeemed: number
  cancelled: number
  refunded: number
}): Rate {
  const redeemable = input.issued - input.cancelled - input.refunded
  return rate(input.redeemed, redeemable)
}

/** `0.0734` -> `'7.3%'`, and a null rate -> `'—'`. */
export function formatRate(r: Rate): string {
  if (r.value === null) return '—'
  return `${(r.value * 100).toFixed(1)}%`
}
