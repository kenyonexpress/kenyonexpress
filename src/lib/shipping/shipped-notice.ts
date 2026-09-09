/**
 * What the customer is told when a parcel leaves, and under which key.
 *
 * THE STATE THIS ARRIVED IN, MEASURED 2026-09-10 AGAINST PRODUCTION
 *
 * Every consumer of `order_shipped` exists and works: the email builder
 * (`buildOrderShippedEmail`, with per-parcel carrier and tracking), the in-app
 * row (`buildInAppContent`), the SMS template, the push template, the
 * preference switch. `notification_outbox_kind_check` accepts the kind.
 *
 * Nothing produced it. The only producer is `tg_orders_notify_shipped`, and it
 * fires `AFTER UPDATE OF status ON orders WHEN NEW.status = 'fulfilled'` --
 * while the act of shipping updates `order_items.item_status`, and no code
 * anywhere in this repo ever writes `orders.status = 'fulfilled'` (grepped: the
 * literal appears only in enum lists). So the mail that carries the tracking
 * number could only ever be sent by an admin manually overriding the ORDER's
 * status, after the fact, and would say "נשלח" at the moment the order was
 * being closed as complete. In practice: an admin types a carrier and a
 * tracking number, and the customer is told nothing.
 *
 * WHY THE KEY CHANGES ON THE LAST PARCEL
 *
 * An order here mixes suppliers and ships in several parcels. Each one leaving
 * is news, so each gets a notice keyed `order-shipped:<order>:<item>`.
 *
 * The LAST one to leave takes the order-level key `order-shipped:<order>`
 * instead -- the exact key the database trigger will use if somebody later
 * flips the order to `fulfilled`. `fn_enqueue_notification` inserts
 * ON CONFLICT (dedupe_key) DO NOTHING, so that pre-empts the trigger and the
 * customer is not told twice about the same event by two different mechanisms.
 * The trigger is left in place: it is the safety net for any path that reaches
 * `fulfilled` without coming through the server action.
 *
 * WHY `partial` IS IN THE PAYLOAD
 *
 * The existing mail body reads "ההזמנה שלך טופלה במלואה ויצאה לדרך", which is
 * true for the trigger (it fires on fulfilment) and false for one parcel out of
 * three. The flag lets the builder say the accurate sentence, and its ABSENCE
 * keeps the trigger's mail reading exactly as it did.
 */

export interface NoticeLine {
  id: string
  itemStatus: string
  productType: string
  carrier: string | null
  trackingNumber: string | null
}

export interface ShippedNoticeInput {
  orderId: string
  /** The line that just shipped. */
  shippedItemId: string
  lines: readonly NoticeLine[]
  /** ISO stamp for the notice. */
  at: string
  customerName: string | null
}

export interface ShippedNotice {
  dedupeKey: string
  payload: Record<string, unknown>
  partial: boolean
}

const DEAD_STATES = new Set(['cancelled', 'refunded'])

/** Lines still owed to the customer: physical, not cancelled, not refunded. */
function liveLines(lines: readonly NoticeLine[]): NoticeLine[] {
  return lines.filter((l) => l.productType === 'physical' && !DEAD_STATES.has(l.itemStatus))
}

export function buildShippedNotice(input: ShippedNoticeInput): ShippedNotice {
  const live = liveLines(input.lines)
  const moved = live.filter((l) => l.itemStatus === 'shipped' || l.itemStatus === 'delivered')
  const partial = live.length > 0 && moved.length < live.length

  /**
   * Every parcel that has a number, not only the one that just left: a customer
   * opening the third mail wants all three numbers in front of them, and the
   * email builder already renders a list.
   */
  const shipments = moved
    .filter((l) => (l.trackingNumber ?? '').trim() !== '' || (l.carrier ?? '').trim() !== '')
    .map((l) => ({ carrier: l.carrier, tracking_number: l.trackingNumber }))

  return {
    dedupeKey: partial
      ? `order-shipped:${input.orderId}:${input.shippedItemId}`
      : `order-shipped:${input.orderId}`,
    partial,
    payload: {
      order_id: input.orderId,
      order_ref: input.orderId.slice(0, 8).toUpperCase(),
      customer_name: input.customerName,
      item_count: live.length,
      fulfilled_at: input.at,
      // `undefined` would survive JSON.stringify as an absent key anyway; null
      // is used so the shape is explicit in the row.
      shipments: shipments.length > 0 ? shipments : null,
      ...(partial ? { partial: true, shipped_count: moved.length } : {}),
    },
  }
}
