import { buildRefundCompletedEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Refund-completed template, the typed entry point.
 *
 * Delegates to `buildRefundCompletedEmail` in `../notifications.ts`, which is
 * what the outbox drain renders; see `./order-confirmation.ts` for why the HTML
 * is not duplicated here. This module only replaces the drain's frozen
 * `Record<string, unknown>` payload with a compile-checked interface.
 *
 * TWO FIELDS THAT LOOK OPTIONAL AND ARE NOT INTERCHANGEABLE.
 *
 * `cancelOnly` selects a different sentence, not a different tone. It is the
 * same-clearing-day path, where the charge was voided before it ever reached
 * the customer's statement - so the mail says the amount will not be taken at
 * all, rather than announcing a credit that has no debit to sit beside. Getting
 * this wrong sends a customer looking for a refund line that will never appear.
 *
 * `cancellationFeeAgorot` renders a line only when a fee was actually taken.
 * Passing 0 renders nothing, deliberately: printing "דמי ביטול: ₪0" on a defect
 * claim reads as though a fee nearly happened, and `computeCancellationFee`
 * returns 0 for precisely the cases where the customer is entitled to the whole
 * sum back.
 *
 * Money is agorot, integer. Nothing here divides by 100.
 */

export interface RefundCompletedInput {
  /** What was actually credited, in agorot. Non-positive returns null. */
  refundedAgorot: number
  /**
   * Cancellation fee withheld, in agorot. Omit or pass 0 when none was taken;
   * the fee line is then not rendered at all.
   */
  cancellationFeeAgorot?: number
  /** Human order reference, shown in the sentence when present. */
  orderRef?: string | null
  /**
   * True when the charge was voided on the same clearing day rather than
   * credited back. Changes the sentence; see above.
   */
  cancelOnly?: boolean
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildRefundCompletedEmail(input: RefundCompletedInput): BuiltEmail | null {
  return buildFromPayload(
    {
      refunded_agorot: input.refundedAgorot,
      cancellation_fee_agorot: input.cancellationFeeAgorot ?? 0,
      order_ref: input.orderRef ?? undefined,
      cancel_only: input.cancelOnly === true,
    },
    input.siteUrl,
  )
}
