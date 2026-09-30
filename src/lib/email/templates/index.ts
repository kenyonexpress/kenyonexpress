import { type SendEmailInput, type SendEmailResult, sendEmail } from '@/lib/email/resend'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * The transactional-email templates, behind one door.
 *
 * Each template is a pure builder: input in, `{ subject, html, text }` out,
 * RTL Hebrew, a full responsive document out of `../layout.ts` (viewport
 * meta, a fluid table capped at 600px, one media query for phones) with every
 * colour and size still inline, because mail clients do not honour
 * stylesheets. No transport and no network, so what a customer reads is
 * testable directly; `./catalogue.ts` lists the eight customer-facing ones
 * with a sample each, and `./catalogue.test.ts` holds all eight to the same
 * document rule.
 *
 * Sending is `sendEmail` from `../resend.ts`, Resend's REST endpoint, typed,
 * and deliberately never-throwing, because a mail provider being down must not
 * turn a completed purchase into a failed one. The outbox kinds are sent by
 * the drain at `/api/cron/notifications`; the two auth mails by
 * `server/auth/*-send.ts`.
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
  buildShippingUpdateEmail,
  type ShippingUpdateInput,
  type ShippingUpdateShipment,
} from './shipping-update'
export {
  buildDeliveryConfirmationEmail,
  type DeliveryConfirmationInput,
} from './delivery-confirmation'
export { buildCashbackEarnedEmail, type CashbackEarnedInput } from './cashback-earned'
export {
  buildCashbackCreditedEmail,
  type CashbackCreditedInput,
} from './cashback-credited'
export { buildPriceDropEmail, type PriceDropInput } from './price-drop'
export { buildWelcomeEmail, type WelcomeInput } from './welcome'
export {
  buildPasswordResetEmail,
  type BuiltPasswordResetEmail,
  type PasswordResetEmailInput,
} from './password-reset'
export {
  buildMagicLinkEmail,
  type BuiltMagicLinkEmail,
  type MagicLinkEmailInput,
} from './magic-link'
export {
  buildCouponDeliveryEmail,
  type CouponDeliveryInput,
  type CouponDeliveryLine,
} from './coupon-delivery'
export {
  EMAIL_TEMPLATE_CATALOGUE,
  type EmailTemplateEntry,
  type EmailTemplateId,
} from './catalogue'

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
