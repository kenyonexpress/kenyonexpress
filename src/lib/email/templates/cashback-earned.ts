import { buildCashbackCreditedEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Cashback-earned template, the typed entry point.
 *
 * Delegates to `buildCashbackCreditedEmail` in `../notifications.ts`, which is
 * what the outbox drain renders for `cashback_credited`; see
 * `./order-confirmation.ts` for why the HTML is not duplicated here. This
 * module only replaces the drain's frozen `Record<string, unknown>` payload
 * with a compile-checked interface.
 *
 * "Earned" is the customer's word and "credited" is the ledger's; they are
 * the same event, enqueued by `finalizeOrder` AFTER `fn_wallet_transfer` has
 * moved the money, never before. `./cashback-credited.ts` keeps the older
 * name as an alias so neither spelling drifts into a second template.
 *
 * Returns null for a non-positive amount, exactly like the builder: an email
 * that celebrates ₪0 landing in the wallet is worse than no email, and the
 * caller should treat "nothing to say" as not-an-error.
 */

export interface CashbackEarnedInput {
  /** The credit that actually moved through the wallet ledger, in agorot. */
  amountAgorot: number
  /** Human order reference, when the credit came from one purchase. */
  orderRef?: string | null
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildCashbackEarnedEmail(input: CashbackEarnedInput): BuiltEmail | null {
  return buildFromPayload(
    {
      amount_agorot: input.amountAgorot,
      order_ref: input.orderRef ?? undefined,
    },
    input.siteUrl,
  )
}
