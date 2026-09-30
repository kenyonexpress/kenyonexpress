/**
 * Password-reset template, behind the templates door.
 *
 * The builder lives in `../password-reset.ts` beside `../magic-link.ts`,
 * because the two auth mails share one rule the outbox mails do not: exactly
 * one link, and the sender of that link is `server/auth/*-send.ts`, never
 * the outbox drain. This module only puts it in the catalogue.
 */
export {
  buildPasswordResetEmail,
  type BuiltPasswordResetEmail,
  type PasswordResetEmailInput,
} from '@/lib/email/password-reset'
