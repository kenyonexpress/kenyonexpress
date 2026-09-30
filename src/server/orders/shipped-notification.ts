import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * "Your order is on its way", on both channels, enqueued by the fulfilment
 * board the moment a parcel is marked shipped.
 *
 * WHY THIS IS APP-SIDE AND NOT A TRIGGER. The email trigger that exists
 * (`tg_orders_notify_shipped`, 183/196) fires when the ORDER reaches
 * `fulfilled`, which on this schema is the end of the parcel's journey, not
 * the start: the customer learned the parcel had shipped on the day it was
 * delivered. The board has the tracking number in hand at ship time, so the
 * mail goes out then, with the same dedupe key the trigger uses
 * (`order-shipped:<order_id>`). When the order is later fulfilled the trigger
 * enqueues into the same key and `ON CONFLICT DO NOTHING` drops it: one
 * shipped mail per order, whichever writer got there first. An order shipped
 * through the older per-line buttons still gets its mail from the trigger.
 *
 * WhatsApp goes through `fn_enqueue_whatsapp` (173), which is the consent
 * gate: no opted-in contact, no row, no error. The outbox CHECK of 173 does
 * not yet list `order_shipped`; until pending 252 widens it the INSERT inside
 * the function raises 23514, which is caught here and logged, and the email
 * still goes. A schema gap must not hold the parcel hostage.
 *
 * Nothing here divides money; the payload carries no amount.
 */

export interface ShipmentEntry {
  carrier: string | null
  tracking_number: string | null
}

export interface ShippedNotificationInput {
  orderId: string
  userId: string
  addressId: string | null
  itemCount: number
  shipments: ShipmentEntry[]
}

export interface ShippedNotificationOutcome {
  email: 'queued' | 'duplicate' | 'no_email' | 'failed'
  whatsapp: 'queued' | 'no_phone' | 'not_accepted' | 'failed'
}

const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

type AdminClient = ReturnType<typeof createAdminClient>

export function shippedDedupeKey(orderId: string): string {
  return `order-shipped:${orderId}`
}

export function shippedWhatsAppDedupeKey(orderId: string): string {
  return `wa:order_shipped:${orderId}`
}

export async function enqueueShippedNotifications(
  admin: AdminClient,
  input: ShippedNotificationInput,
): Promise<ShippedNotificationOutcome> {
  const orderRef = input.orderId.slice(0, 8).toUpperCase()

  // The same lookup order the 173 trigger uses: the profile first, then the
  // shipping address on the order, which is where a phone-less profile put
  // the number the courier will call.
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

  // Only lines with a number are worth a line in the message; the renderers
  // drop the rest anyway, so the payload carries what will be read.
  const shipments = input.shipments.filter(
    (s) => typeof s.tracking_number === 'string' && s.tracking_number.trim() !== '',
  )
  const now = new Date().toISOString()

  let email: ShippedNotificationOutcome['email'] = 'no_email'
  if (profile?.email) {
    const { error } = await admin.from('notification_outbox').insert({
      kind: 'order_shipped',
      recipient_email: profile.email,
      user_id: input.userId,
      dedupe_key: shippedDedupeKey(input.orderId),
      payload: {
        order_id: input.orderId,
        order_ref: orderRef,
        customer_name: name,
        item_count: input.itemCount,
        fulfilled_at: now,
        shipments: shipments.length > 0 ? shipments : null,
      },
    })
    if (!error) email = 'queued'
    else if (error.code === UNIQUE_VIOLATION || error.message.includes('duplicate')) {
      email = 'duplicate'
    } else {
      email = 'failed'
      log.warn('fulfillment.shipped_email_enqueue_failed', {
        orderId: input.orderId,
        reason: error.message,
      })
    }
  }

  let whatsapp: ShippedNotificationOutcome['whatsapp'] = 'no_phone'
  if (phone) {
    const { error } = await admin.rpc('fn_enqueue_whatsapp', {
      p_kind: 'order_shipped',
      p_phone: phone,
      p_dedupe: shippedWhatsAppDedupeKey(input.orderId),
      p_payload: {
        order_id: input.orderId,
        order_ref: orderRef,
        customer_name: name,
        status: 'shipped',
        shipments,
      },
    })
    if (!error) whatsapp = 'queued'
    else if (error.code === CHECK_VIOLATION) {
      whatsapp = 'not_accepted'
      log.warn('fulfillment.whatsapp_kind_not_accepted', {
        orderId: input.orderId,
        hint: 'migration 252 widens whatsapp_outbox_kind_check with order_shipped',
      })
    } else {
      whatsapp = 'failed'
      log.warn('fulfillment.shipped_whatsapp_enqueue_failed', {
        orderId: input.orderId,
        reason: error.message,
      })
    }
  }

  return { email, whatsapp }
}
