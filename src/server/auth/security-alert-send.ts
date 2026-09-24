import { sendEmail } from '@/lib/email/resend'
import { type SecurityEvent, buildSecurityAlertEmail } from '@/lib/email/security-alert'
import { log } from '@/lib/observability/log'
import { siteUrl } from '@/lib/site-url'

/**
 * Send the security alert for a change that already happened, or say it
 * could not.
 *
 * BEST-EFFORT AND NEVER THROWING, like the magic-link sender next to it. By
 * the time this runs the password is changed, the factor verified or the
 * passkey stored; a mail that will not send is not a reason to fail the
 * action or to report the change as not made. Every outcome is logged with
 * the event and without the address.
 *
 * Only through Resend and only when `RESEND_API_KEY` is set (Q09). There is
 * no Supabase fallback here because Supabase has no such mail; a machine with
 * no key sends nothing and says so once, which is what `sendEmail` already
 * does.
 *
 * `idempotencyKey` is the event plus the minute, so a double submit of the
 * same form sends one alert rather than two, while a real second change an
 * hour later sends its own.
 */
export async function trySendSecurityAlert(input: {
  email: string | null | undefined
  event: SecurityEvent
  userId: string
}): Promise<boolean> {
  if (!input.email) return false
  if (!process.env.RESEND_API_KEY) return false

  try {
    const at = new Date().toISOString()
    const built = buildSecurityAlertEmail({ event: input.event, at, siteUrl: siteUrl() })
    const result = await sendEmail({
      to: input.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      idempotencyKey: `security-alert:${input.userId}:${input.event}:${at.slice(0, 16)}`,
      tag: `security_${input.event}`,
    })
    if (!result.ok && !result.skipped) {
      log.warn('auth.security_alert_send_failed', { event: input.event, reason: result.reason })
    }
    return result.ok
  } catch (error) {
    log.warn('auth.security_alert_send_threw', {
      event: input.event,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}
