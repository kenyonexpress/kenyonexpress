import { buildVoucherExpiringEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Voucher-expiry reminder, the typed entry point.
 *
 * Delegates to `buildVoucherExpiringEmail` in `../notifications.ts`. Returns
 * null when there is neither a positive day count nor a date: a reminder with
 * no deadline is a nag, so the caller should skip the send.
 */

export interface VoucherExpiryInput {
  /** Whole days left. Non-positive is only renderable with `expiresAt`. */
  daysRemaining: number
  /** ISO timestamp of the expiry. */
  expiresAt?: string | null
  productName?: string | null
  supplierName?: string | null
  /** Origin with no trailing slash, e.g. https://www.kenyonexpress.co.il */
  siteUrl: string
}

export function buildVoucherExpiryEmail(input: VoucherExpiryInput): BuiltEmail | null {
  return buildFromPayload(
    {
      days_remaining: input.daysRemaining,
      expires_at: input.expiresAt ?? undefined,
      product_name: input.productName ?? undefined,
      supplier_name: input.supplierName ?? undefined,
    },
    input.siteUrl,
  )
}
