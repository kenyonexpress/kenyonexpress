import { log } from '@/lib/observability/log'
import { type ShippingLineLike, summarizeShipping } from '@/lib/orders/shipping-summary'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Your order was delivered", enqueued by the application when the last
 * physical line of an order reaches `delivered`.
 *
 * WHY THIS IS APP-SIDE AND NOT A TRIGGER. On this schema "delivered" is a
 * fold over `order_items.item_status` (`summarizeShipping`), not an order
 * status, so there is no transition for a trigger to watch. The two writers
 * of that line status, the fulfilment board and the per-line admin action,
 * both call this once the fold says delivered.
 *
 * EMAIL: kind `order_delivered` through `fn_enqueue_notification`, dedupe
 * `order-delivered:<order_id>`. Pending migration 253 widens the CHECK;
 * until then the enqueue raises 23514, which is caught, logged and reported
 * as `not_accepted`. The delivery itself stands.
 *
 * WHATSAPP (STEP 17): kind `order_fulfilled`, the delivery confirmation the
 * 173 trigger already sends when the ORDER reaches `fulfilled`, under the
 * trigger's own dedupe key `wa:order_fulfilled:<order_id>`. The board path
 * fulfils the order right after calling this, so the trigger's enqueue
 * collides on the key and `ON CONFLICT DO NOTHING` drops it: one message
 * per order whichever writer got there first. The per-line path never moves
 * the order, so this is the only writer there. No new kind, no migration.
 * Consent is the RPC's business (`fn_enqueue_whatsapp` refuses a phone that
 * is not opted in, silently) and the drain re-checks it at send time.
 *
 * Nothing here carries money; a delivery notice is not a money event.
 */

export interface DeliveredNotificationInput {
  orderId: string
  /** Null for an order with no account behind it; then there is nobody to mail. */
  userId: string | null
  /** The shipping address on the order: the phone fallback when the profile has none. */
  addressId?: string | null
  itemCount: number
}

export type DeliveredEmailOutcome = 'queued' | 'no_email' | 'not_accepted' | 'failed'
export type DeliveredWhatsAppOutcome = 'queued' | 'no_phone' | 'failed'

export interface DeliveredNotificationOutcome {
  email: DeliveredEmailOutcome
  whatsapp: DeliveredWhatsAppOutcome
}

const CHECK_VIOLATION = '23514'

type AdminClient = ReturnType<typeof createAdminClient>

export function deliveredDedupeKey(orderId: string): string {
  return `order-delivered:${orderId}`
}

/** The 173 trigger's key for the same message, so the two writers collapse. */
export function deliveredWhatsAppDedupeKey(orderId: string): string {
  return `wa:order_fulfilled:${orderId}`
}

export function orderIsDelivered(lines: readonly ShippingLineLike[]): boolean {
  return summarizeShipping(lines).kind === 'delivered'
}

export async function enqueueDeliveredNotification(
  admin: AdminClient,
  input: DeliveredNotificationInput,
): Promise<DeliveredNotificationOutcome> {
  if (!input.userId) return { email: 'no_email', whatsapp: 'no_phone' }

  const orderRef = input.orderId.slice(0, 8).toUpperCase()

  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name, phone')
    .eq('id', input.userId)
    .maybeSingle()

  let phone: string | null = profile?.phone ?? null
  let name: string | null = profile?.full_name ?? null
  if (!phone && input.addressId) {
    const { data: address } = await admin
      .from('user_addresses')
      .select('phone, full_name')
      .eq('id', input.addressId)
      .maybeSingle()
    phone = address?.phone ?? null
    name = name ?? address?.full_name ?? null
  }

  const deliveredAt = new Date().toISOString()

  let email: DeliveredEmailOutcome = 'no_email'
  if (profile?.email) {
    const { error } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'order_delivered',
      p_email: profile.email,
      p_dedupe: deliveredDedupeKey(input.orderId),
      p_payload: {
        order_id: input.orderId,
        order_ref: orderRef,
        customer_name: name,
        item_count: input.itemCount,
        delivered_at: deliveredAt,
      },
      p_user_id: input.userId,
    })
    if (!error) email = 'queued'
    else if (error.code === CHECK_VIOLATION) {
      email = 'not_accepted'
      log.warn('fulfillment.delivered_kind_not_accepted', {
        orderId: input.orderId,
        hint: 'migration 253 widens notification_outbox_kind_check with order_delivered',
      })
    } else {
      email = 'failed'
      log.warn('fulfillment.delivered_email_enqueue_failed', {
        orderId: input.orderId,
        reason: error.message,
      })
    }
  }

  let whatsapp: DeliveredWhatsAppOutcome = 'no_phone'
  if (phone) {
    const { error } = await admin.rpc('fn_enqueue_whatsapp', {
      p_kind: 'order_fulfilled',
      p_phone: phone,
      p_dedupe: deliveredWhatsAppDedupeKey(input.orderId),
      p_payload: {
        order_id: input.orderId,
        order_ref: orderRef,
        customer_name: name,
        status: 'delivered',
        delivered_at: deliveredAt,
      },
    })
    if (!error) whatsapp = 'queued'
    else {
      whatsapp = 'failed'
      log.warn('fulfillment.delivered_whatsapp_enqueue_failed', {
        orderId: input.orderId,
        reason: error.message,
      })
    }
  }

  return { email, whatsapp }
}
