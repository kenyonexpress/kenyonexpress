import { buildPasswordResetEmail } from '@/lib/email/password-reset'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Send the branded Hebrew password-reset mail through Resend, or say it
 * could not.
 *
 * The sibling of `magic-link-send.ts`, with the same contract: `false` NEVER
 * means "the reset failed"; it means "fall back to `resetPasswordForEmail`",
 * which makes Supabase send its own mail. Every failure mode here, a missing
 * Resend key, a missing service key, Resend down, has that working fallback,
 * and a customer must never be locked out because the pretty mail path broke.
 *
 * An address with no account also lands on the fallback, because
 * `generateLink({ type: 'recovery' })` refuses unknown users, and the
 * fallback is silent for them too. The action's reply is one sentence on
 * every path, so nothing here can turn the form into a registration oracle;
 * `lib/auth/password-reset.ts` is where that rule lives.
 *
 * THE LINK IS OURS, NOT SUPABASE'S `action_link`, for the reason the magic
 * link gives: `action_link` verifies at GoTrue and returns the session in a
 * URL fragment a server route cannot read. The mail carries
 * `/auth/callback?token_hash=…&type=recovery&next=/reset-password`; the
 * callback calls `verifyOtp` with the recovery type and the customer lands on
 * the reset form with a session that authorises `updateUser`.
 */
export async function trySendBrandedPasswordReset(email: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
    const hashedToken = data?.properties?.hashed_token
    if (error || !hashedToken) {
      // Unknown address is routine and must stay quiet; anything else is
      // logged so a broken service key does not silently demote every reset
      // mail to the fallback template.
      if (error && error.status !== 404 && error.status !== 422) {
        log.warn('auth.password_reset_generate_failed', { reason: error.message })
      }
      return false
    }

    const link = `${siteUrl()}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=${encodeURIComponent('/reset-password')}`
    const built = buildPasswordResetEmail({ actionLink: link })
    const result = await sendEmail({
      to: email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    })
    if (!result.ok && !result.skipped) {
      log.warn('auth.password_reset_send_failed', { reason: result.reason })
    }
    return result.ok
  } catch (error) {
    log.warn('auth.password_reset_send_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}
