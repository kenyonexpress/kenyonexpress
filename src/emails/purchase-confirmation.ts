import { buildOrderPaidEmail } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Order-confirmation template, the typed entry point.
 *
 * The HTML itself lives in `buildOrderPaidEmail` in `../notifications.ts`,
 * because that is what the outbox drain at `/api/cron/notifications` renders,
 * and two copies of the same email is exactly the drift
 * `../brand-colour.test.ts` exists to catch. What this module adds is the
 * contract: the drain hands the builder a frozen `Record<string, unknown>`
 * payload, while a direct caller here gets a real interface and a compile
 * error instead of a silently empty field.
 *
 * Money is agorot, integer, as everywhere. `totalAgorot` is formatted by the
 * builder via `formatAgorot`; nothing here divides by 100.
 */

export interface OrderConfirmationInput {
  /** Order UUID. Also derives the on-mail reference when `orderRef` is absent. */
  orderId: string
  /** Human reference shown in the subject. Falls back to the id's first 8 chars. */
  orderRef?: string | null
  customerName?: string | null
  /** Grand total actually paid on the site, in agorot. */
  totalAgorot: number
  itemCount?: number
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildOrderConfirmationEmail(input: OrderConfirmationInput): BuiltEmail {
  return buildOrderPaidEmail(
    {
      order_id: input.orderId,
      order_ref: input.orderRef ?? undefined,
      customer_name: input.customerName ?? undefined,
      total_agorot: input.totalAgorot,
      item_count: input.itemCount ?? 0,
    },
    input.siteUrl,
  )
}
