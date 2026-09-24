import { buildPasswordResetEmail } from '@/lib/email/password-reset'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Send the branded Hebrew password-reset mail through Resend, or say it could
 * not.
 *
 * The same contract as `trySendBrandedMagicLink`: `false` NEVER means "the
 * reset failed"; it means "fall back to `resetPasswordForEmail`", which makes
 * Supabase send its own mail. Every failure mode here -- no Resend key, no
 * service key, an unknown address, Resend down -- has that working fallback,
 * and a customer must never be locked out because the pretty mail path broke.
 *
 * Q09 (25.09.2026) names the password reset as one of the five customer
 * mails that go through Resend when `RESEND_API_KEY` is set. Before this the
 * reset was the one auth mail still on Supabase's SMTP and template.
 *
 * THE LINK IS OURS, NOT SUPABASE'S `action_link`, for the reason the magic
 * link sender gives: `action_link` verifies at GoTrue and hands the session
 * back in a URL fragment a server route cannot read. So the mail carries
 * `/auth/callback?token_hash=…&type=recovery&next=/reset-password`, the
 * callback calls `verifyOtp({ type: 'recovery' })`, and the reset form opens
 * with the recovery session that `updateUser` needs.
 *
 * The caller has already applied the per-IP and per-address ceilings and
 * answers the same neutral message on every path, so nothing here can turn
 * the endpoint into a registration oracle: an unknown address is a `false`
 * that the caller cannot tell from a Resend outage.
 */
export async function trySendBrandedPasswordReset(email: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
    const hashedToken = data?.properties?.hashed_token
    if (error || !hashedToken) {
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
      tag: 'password_reset',
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
