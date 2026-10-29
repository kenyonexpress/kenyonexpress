import { buildVoucherGiftedEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Gift template, the typed entry point.
 *
 * Delegates to `buildVoucherGiftedEmail` in `../notifications.ts`, which is what
 * the outbox drain renders. This module only replaces the drain's frozen
 * `Record<string, unknown>` payload with a compile-checked interface.
 *
 * The claim token is a bearer secret: whoever holds the link gets the coupon.
 * It is never logged here and the mail tells the recipient not to forward it.
 */

export interface GiftInput {
  productName?: string | null
  senderName?: string | null
  recipientName?: string | null
  giftMessage?: string | null
  claimToken: string
  /** ISO timestamp of the coupon expiry. */
  expiresAt?: string | null
  /** Origin with no trailing slash, e.g. https://www.kenyonexpress.co.il */
  siteUrl: string
}

export function buildGiftEmail(input: GiftInput): BuiltEmail {
  return buildFromPayload(
    {
      product_name: input.productName ?? undefined,
      sender_name: input.senderName ?? undefined,
      recipient_name: input.recipientName ?? undefined,
      gift_message: input.giftMessage ?? undefined,
      claim_token: input.claimToken,
      expires_at: input.expiresAt ?? undefined,
    },
    input.siteUrl,
  )
}
