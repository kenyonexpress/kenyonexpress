/**
 * Welcome email template wrapper.
 *
 * Re-exports the welcome email builder from the notifications system.
 * The actual implementation is in src/lib/email/notifications.ts
 *
 * Subject: 'ברוכים הבאים לקניון EXPRESS'
 * Content: Explains how site works + 10₪ cashback bonus
 */

export { buildWelcomeEmail } from '@/lib/email/notifications'
export type { BuiltNotification as WelcomeEmail } from '@/lib/email/notifications'

export const WELCOME_SUBJECT = 'ברוכים הבאים לקניון EXPRESS'
export const SIGNUP_BONUS_AMOUNT_ILS = 10
