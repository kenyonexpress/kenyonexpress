import { buildOrderShippedEmail } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Shipping-update template, the typed entry point.
 *
 * Delegates to `buildOrderShippedEmail` in `../notifications.ts`, which is
 * what the outbox drain renders for `order_shipped`; see
 * `./order-confirmation.ts` for why the HTML is not duplicated here. The
 * enqueuers are `tg_orders_notify_shipped` (183/196) and the fulfilment
 * board (`server/orders/shipped-notification.ts`), both under the dedupe key
 * `order-shipped:<order_id>`.
 *
 * `shipments` is the 196 shape: one entry per line that carries a tracking
 * number. Entries without a number are dropped by the builder, so a caller
 * may pass every line and let the mail say only what can be tracked.
 */

export interface ShippingUpdateShipment {
  /** Courier label as stored on the line; resolved to a tracking URL when known. */
  carrier?: string | null
  trackingNumber: string
}

export interface ShippingUpdateInput {
  /** Order UUID. Also derives the on-mail reference when `orderRef` is absent. */
  orderId: string
  orderRef?: string | null
  customerName?: string | null
  itemCount?: number
  /** ISO timestamp of the fulfilment; omitted when unknown. */
  fulfilledAt?: string | null
  shipments?: ShippingUpdateShipment[]
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildShippingUpdateEmail(input: ShippingUpdateInput): BuiltEmail {
  return buildOrderShippedEmail(
    {
      order_id: input.orderId,
      order_ref: input.orderRef ?? undefined,
      customer_name: input.customerName ?? undefined,
      item_count: input.itemCount ?? 0,
      fulfilled_at: input.fulfilledAt ?? undefined,
      shipments: (input.shipments ?? []).map((s) => ({
        carrier: s.carrier ?? null,
        tracking_number: s.trackingNumber,
      })),
    },
    input.siteUrl,
  )
}
