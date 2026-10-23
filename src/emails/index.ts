/**
 * Transactional email templates for KenyonExpress via Resend.
 *
 * Re-exports from src/lib/email/templates/ to provide the src/emails/ interface
 * specified in C20 while maintaining the existing codebase structure where email
 * infrastructure lives under src/lib/email/.
 *
 * All six required templates:
 * 1. purchase_confirmation - 6-line text + dealer number 033798513
 * 2. password_reset - HTTPS validation, direct send
 * 3. expiry_t7 - Voucher expiry 7 days before
 * 4. expiry_t1 - Voucher expiry 1 day before
 * 5. security_alert - Password/email changes, new sign-in
 * 6. gift_coupon - Scheduled delivery via notification outbox
 */

export {
  // Purchase confirmation - 6-line format with dealer number
  buildOrderConfirmationEmail,
  type OrderConfirmationInput,
} from '@/lib/email/templates/order-confirmation'

export {
  // Password reset with HTTPS validation
  buildPasswordResetEmail,
  type PasswordResetInput,
} from '@/lib/email/templates/auth-mail'

export {
  // Security alerts for auth events
  buildSecurityAlertEmail,
  type SecurityAlertInput,
  type SecurityEventKind,
} from '@/lib/email/templates/auth-mail'

export {
  // Voucher expiry reminders (T-7 and T-1)
  buildVoucherExpiryEmail,
  type VoucherExpiryInput,
} from '@/lib/email/templates/voucher-expiry'

export {
  // Gift coupon delivery
  buildGiftEmail,
  type GiftInput,
} from '@/lib/email/templates/gift'

// Email scheduling functions
export {
  scheduleExpiryReminders,
  scheduleGiftCoupon,
  schedulePurchaseConfirmation,
} from './scheduler'

// Re-export transport and types
export {
  sendEmail,
  sendBuiltEmail,
  mailFrom,
  type SendEmailInput,
  type SendEmailResult,
  type BuiltEmail,
  type SendBuiltEmailOptions,
} from '@/lib/email/templates'
