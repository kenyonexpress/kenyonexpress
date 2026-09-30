/**
 * The fulfilment board's five lanes, derived. Pure.
 *
 * The board asks for new / paid / shipped / delivered / cancelled, and the
 * schema has no such enum: `order_status` is the money lifecycle (pending,
 * paid, partially_fulfilled, fulfilled, cancelled, refunded, platform_settled)
 * and the parcel's progress lives on each PHYSICAL line as `item_status`
 * (pending -> shipped -> delivered, lib/shipping/transitions.ts). Adding a
 * sixth order status for "shipped" would put the same fact in two places and
 * let them disagree, so the lane is computed from the two that exist and is
 * never stored.
 *
 *   new        the order is unpaid (pending)
 *   paid       paid, and no physical line has left yet; coupon-only orders
 *              sit here too, because a voucher is issued, not shipped
 *   shipped    at least one physical line is shipped or delivered and the
 *              order is not yet fulfilled
 *   delivered  the order is fulfilled (or settled), or every physical line
 *              has been delivered
 *   cancelled  cancelled or refunded
 *
 * A cancelled/refunded LINE does not count as a parcel: an order whose only
 * surviving line is delivered is delivered.
 */

export type FulfillmentLane = 'new' | 'paid' | 'shipped' | 'delivered' | 'cancelled'

export const FULFILLMENT_LANES: readonly FulfillmentLane[] = [
  'new',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
]

export const LANE_LABELS: Record<FulfillmentLane, string> = {
  new: 'חדשות',
  paid: 'שולמו',
  shipped: 'נשלחו',
  delivered: 'נמסרו',
  cancelled: 'בוטלו',
}

export interface LaneLine {
  product_type: string
  item_status: string
}

export interface LaneInput {
  status: string
  lines: readonly LaneLine[]
}

const PARCEL_STATUSES = new Set(['pending', 'shipped', 'delivered'])

/** The physical lines that are still a parcel: not cancelled, not refunded. */
export function parcelLines<T extends LaneLine>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.product_type === 'physical' && PARCEL_STATUSES.has(l.item_status))
}

export function laneFor(order: LaneInput): FulfillmentLane {
  switch (order.status) {
    case 'pending':
      return 'new'
    case 'cancelled':
    case 'refunded':
      return 'cancelled'
    case 'fulfilled':
    case 'platform_settled':
      return 'delivered'
    default:
      break
  }
  const parcels = parcelLines(order.lines)
  if (parcels.length === 0) return 'paid'
  if (parcels.every((l) => l.item_status === 'delivered')) return 'delivered'
  if (parcels.some((l) => l.item_status !== 'pending')) return 'shipped'
  return 'paid'
}

/**
 * The moves the board offers. Every one of them is executed by an audited
 * server action that re-derives the verdict; this is only the menu.
 *
 *   new -> cancelled      the one-click pending cancel (reason required)
 *   paid -> shipped       ship every pending physical line, tracking required
 *   shipped -> shipped    a partial shipment: ship the lines still pending
 *   shipped -> delivered  deliver every shipped line, then fulfil the order
 *
 * paid -> cancelled is absent on purpose: a paid order is refunded through the
 * refund console, where the money moves. There is no move out of delivered or
 * cancelled, which are terminal on the board as they are in the machine.
 */
export type BoardMove = 'ship' | 'deliver' | 'cancel'

export function moveForDrop(from: FulfillmentLane, to: FulfillmentLane): BoardMove | null {
  if (from === 'new' && to === 'cancelled') return 'cancel'
  if (from === 'paid' && to === 'shipped') return 'ship'
  if (from === 'shipped' && to === 'delivered') return 'deliver'
  return null
}

/** Which bulk buttons make sense for a selection drawn from these lanes. */
export function movesForLanes(lanes: readonly FulfillmentLane[]): BoardMove[] {
  const set = new Set(lanes)
  const moves: BoardMove[] = []
  if (set.has('paid') || set.has('shipped')) moves.push('ship')
  if (set.has('shipped')) moves.push('deliver')
  if (set.has('new')) moves.push('cancel')
  return moves
}
