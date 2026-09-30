import { buildOrderDeliveredEmail } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Delivery-confirmation template, the typed entry point.
 *
 * Delegates to `buildOrderDeliveredEmail` in `../notifications.ts`, the
 * renderer behind the `order_delivered` outbox kind (STEP 16, constraint
 * widened by pending 253). Enqueued by
 * `server/orders/delivered-notification.ts` when the last live physical line
 * of an order reaches `delivered`, from both writers of that status: the
 * fulfilment board and the per-line admin action.
 */

export interface DeliveryConfirmationInput {
  /** Order UUID. Links the order page and derives the reference when absent. */
  orderId: string
  orderRef?: string | null
  customerName?: string | null
  itemCount?: number
  /** ISO timestamp of the last delivery; omitted when unknown. */
  deliveredAt?: string | null
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildDeliveryConfirmationEmail(input: DeliveryConfirmationInput): BuiltEmail {
  return buildOrderDeliveredEmail(
    {
      order_id: input.orderId,
      order_ref: input.orderRef ?? undefined,
      customer_name: input.customerName ?? undefined,
      item_count: input.itemCount ?? 0,
      delivered_at: input.deliveredAt ?? undefined,
    },
    input.siteUrl,
  )
}
