import { buildMagicLinkEmail } from '@/lib/email/magic-link'
import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Send the branded Hebrew magic-link mail through Resend, or say it could not.
 *
 * `false` NEVER means "the login failed"; it means "fall back to
 * `signInWithOtp`", which makes Supabase send its own mail. The action treats
 * this as best-effort on purpose: every failure mode here, a missing Resend
 * key, a missing service key, Resend down, has a working fallback, and a
 * customer must never be unable to log in because the pretty mail path broke.
 *
 * An address with no account also lands on the fallback, because
 * `generateLink({ type: 'magiclink' })` refuses unknown users while
 * `signInWithOtp` creates them. First-time sign-ups therefore get Supabase's
 * template once and the branded mail from their second login on. The action's
 * success message is identical on both paths, so the response does not reveal
 * whether the address exists.
 *
 * THE LINK IS OURS, NOT SUPABASE'S `action_link`. The `action_link` verifies
 * at GoTrue's `/verify` and then hands the session back in a URL FRAGMENT,
 * which a server-side callback route can never read. So the mail carries
 * `/auth/callback?token_hash=…` and the callback calls `verifyOtp`, the
 * documented custom-email pattern, keeping welcome/referral/cart-merge in the
 * one callback that already owns them.
 */
export async function trySendBrandedMagicLink(email: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const hashedToken = data?.properties?.hashed_token
    if (error || !hashedToken) {
      // Unknown address is the routine case (first-time sign-up); anything
      // else is logged so a broken service key does not silently demote every
      // login mail to the fallback template.
      if (error && error.status !== 404 && error.status !== 422) {
        log.warn('auth.magic_link_generate_failed', { reason: error.message })
      }
      return false
    }

    const link = `${siteUrl()}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink`
    const built = buildMagicLinkEmail({ actionLink: link })
    const result = await sendEmail({
      to: email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    })
    if (!result.ok && !result.skipped) {
      log.warn('auth.magic_link_send_failed', { reason: result.reason })
    }
    return result.ok
  } catch (error) {
    log.warn('auth.magic_link_send_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}
