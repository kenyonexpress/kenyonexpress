/**
 * Coupon-delivery template.
 *
 * `../voucher-email.ts` IS this template: the email a customer gets when their
 * coupon is issued, already typed (`VoucherEmailInput`), RTL Hebrew, inline
 * styles, and covered by `../voucher-email.test.ts` and
 * `../brand-colour.test.ts`. This module gives it the canonical
 * `templates/` name without creating a second copy of the HTML, for the same
 * reason the brand yellow is policed by a test: two builders for one email
 * drift, and nothing fails when they do.
 *
 * The design decisions that matter (no embedded QR image, both amounts stated
 * with what is still owed at the counter last) are documented on the builder
 * itself.
 */

export {
  buildVoucherEmail as buildCouponDeliveryEmail,
  type BuiltEmail,
  type VoucherEmailInput as CouponDeliveryInput,
  type VoucherEmailLine as CouponDeliveryLine,
} from '@/lib/email/voucher-email'
