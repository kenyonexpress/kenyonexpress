import { log } from '@/lib/observability/log'
import { type ShippingLineLike, summarizeShipping } from '@/lib/orders/shipping-summary'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Your order was delivered", enqueued by the application when the LAST live
 * physical line of an order reaches `delivered`.
 *
 * WHY THIS IS APP-SIDE AND NOT A TRIGGER. On this schema "delivered" is not
 * an order status; it is a fold over `order_items.item_status`
 * (`summarizeShipping`, the same rule the account pages use), and a trigger
 * on the line table would fire once per parcel and have to re-derive the
 * fold in SQL that the TypeScript already owns. `item_status = 'delivered'`
 * has exactly two writers, the fulfilment board and the per-line admin
 * action, and both call this after their UPDATE with the lines they now
 * know. Deduped on the order id, so a two-parcel order delivered in two
 * sessions mails once, when the second one lands.
 *
 * Through `fn_enqueue_notification` (the five-argument overload, with the
 * user id so 231's in-app bell rings), which also applies the suppression
 * list. The outbox CHECK does not list `order_delivered` until pending 253
 * is applied; until then the INSERT inside the function raises 23514, which
 * is caught here and logged, and the delivery itself stands. A schema gap
 * must not undo a parcel that arrived.
 *
 * Nothing here divides money; the payload carries no amount.
 */

export interface DeliveredNotificationInput {
  orderId: string
  /** Null for an order with no account behind it; then there is nobody to mail. */
  userId: string | null
  itemCount: number
}

export type DeliveredNotificationOutcome = 'queued' | 'no_email' | 'not_accepted' | 'failed'

const CHECK_VIOLATION = '23514'

type AdminClient = ReturnType<typeof createAdminClient>

export function deliveredDedupeKey(orderId: string): string {
  return `order-delivered:${orderId}`
}

/**
 * The fold, named: true when every live physical line is delivered. Coupons
 * and cancelled or refunded lines do not count, per `summarizeShipping`.
 */
export function orderIsDelivered(lines: readonly ShippingLineLike[]): boolean {
  return summarizeShipping(lines).kind === 'delivered'
}

export async function enqueueDeliveredNotification(
  admin: AdminClient,
  input: DeliveredNotificationInput,
): Promise<DeliveredNotificationOutcome> {
  if (!input.userId) return 'no_email'

  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', input.userId)
    .maybeSingle()
  if (!profile?.email) return 'no_email'

  const { error } = await admin.rpc('fn_enqueue_notification', {
    p_kind: 'order_delivered',
    p_email: profile.email,
    p_dedupe: deliveredDedupeKey(input.orderId),
    p_payload: {
      order_id: input.orderId,
      order_ref: input.orderId.slice(0, 8).toUpperCase(),
      customer_name: profile.full_name ?? null,
      item_count: input.itemCount,
      delivered_at: new Date().toISOString(),
    },
    p_user_id: input.userId,
  })
  if (!error) return 'queued'

  if (error.code === CHECK_VIOLATION) {
    log.warn('fulfillment.delivered_kind_not_accepted', {
      orderId: input.orderId,
      hint: 'migration 253 widens notification_outbox_kind_check with order_delivered',
    })
    return 'not_accepted'
  }
  log.warn('fulfillment.delivered_email_enqueue_failed', {
    orderId: input.orderId,
    reason: error.message,
  })
  return 'failed'
}
