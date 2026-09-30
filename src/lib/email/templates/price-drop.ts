import { buildPriceDropEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Price-drop template, the typed entry point.
 *
 * Delegates to `buildPriceDropEmail` in `../notifications.ts`, the renderer
 * behind the `price_drop` outbox kind that `/api/cron/wishlist-alerts` (200)
 * enqueues. Both prices are agorot, frozen by the cron at the moment it
 * compared them, so the mail states the drop that was detected even if the
 * price moves again before the queue drains.
 *
 * Returns null when the drop cannot be stated (no product name, or the new
 * price is not below the old one), exactly like the builder.
 */

export interface PriceDropInput {
  productName: string
  /** Product slug; without one the button leads to the wishlist instead. */
  slug?: string | null
  oldAgorot: number
  newAgorot: number
  /** Signed per-recipient unsubscribe URL from `lib/wishlist/unsubscribe-token.ts`. */
  unsubscribeUrl?: string | null
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildPriceDropEmail(input: PriceDropInput): BuiltEmail | null {
  return buildFromPayload(
    {
      product_name: input.productName,
      slug: input.slug ?? undefined,
      old_agorot: input.oldAgorot,
      new_agorot: input.newAgorot,
      unsubscribe_url: input.unsubscribeUrl ?? undefined,
    },
    input.siteUrl,
  )
}
