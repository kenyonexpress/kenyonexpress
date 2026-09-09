import { type SendEmailInput, type SendEmailResult, sendEmail } from '@/lib/email/resend'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * The transactional-email templates, behind one door.
 *
 * Each template is a pure builder: input in, `{ subject, html, text }` out,
 * RTL Hebrew, inline styles only (mail clients do not honour stylesheets), no
 * transport and no network, so what a customer reads is testable directly.
 * Sending is `sendEmail` from `../resend.ts` — Resend's REST endpoint, typed,
 * and deliberately never-throwing, because a mail provider being down must not
 * turn a completed purchase into a failed one.
 *
 * `sendBuiltEmail` is the bridge for callers that hold a built template: it
 * addresses it and hands it to the transport in one typed step, and passing
 * the same `idempotencyKey` twice sends one email, not two (Resend
 * deduplicates on its idempotency header).
 */

export {
  buildOrderConfirmationEmail,
  type OrderConfirmationInput,
} from './order-confirmation'
export {
  buildCouponDeliveryEmail,
  type CouponDeliveryInput,
  type CouponDeliveryLine,
} from './coupon-delivery'
export {
  buildCashbackCreditedEmail,
  type CashbackCreditedInput,
} from './cashback-credited'

export { sendEmail, mailFrom } from '@/lib/email/resend'
export type { SendEmailInput, SendEmailResult } from '@/lib/email/resend'
export type { BuiltEmail } from '@/lib/email/voucher-email'

export interface SendBuiltEmailOptions {
  to: string
  /** Same key for the same logical email; Resend deduplicates on it. */
  idempotencyKey?: string
  replyTo?: string
}

/** Address a built template and send it. Never throws; see `../resend.ts`. */
export async function sendBuiltEmail(
  email: BuiltEmail,
  options: SendBuiltEmailOptions,
): Promise<SendEmailResult> {
  const input: SendEmailInput = {
    to: options.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  }
  return sendEmail(input)
}
