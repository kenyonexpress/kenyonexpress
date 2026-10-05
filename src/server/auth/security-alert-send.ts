import { sendEmail } from '@/lib/email/resend'
import { type SecurityEvent, buildSecurityAlertEmail } from '@/lib/email/security-alert'
import { log } from '@/lib/observability/log'
import { pushOutboxRow } from '@/lib/push/dispatch'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'

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
  // The push leg goes first and is independent of the mail: an account with
  // no address, or a deployment with no Resend key, still has browsers and
  // phones that said yes to notifications, and a sign-in method changing is
  // exactly what they said yes for. Its result does not feed the return
  // value, which has always meant "the mail went".
  await tryPushSecurityAlert(input)

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

/**
 * W14 (05.10.2026). The security alert as a push, to every device the
 * customer subscribed, through the same dispatcher the outbox uses.
 *
 * NOT AN OUTBOX ROW. `notification_outbox_kind_check` does not carry
 * `security_alert`, widening it is a migration, and this alert has never
 * waited for the cron drain: it is sent in the action that changed the
 * sign-in method, so the customer whose password just changed hears about it
 * now and not at the next tick. `pushOutboxRow` takes a row-shaped object
 * with no `id`, which is what the delivery log records as an outbox-less
 * send.
 *
 * Never throws and never blocks the mail: a push failure is logged and that
 * is the end of it. The dedupe is the template's notification tag, so a
 * retry on the push service collapses into one card rather than two.
 */
async function tryPushSecurityAlert(input: {
  email: string | null | undefined
  event: SecurityEvent
  userId: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const result = await pushOutboxRow(
      admin as never,
      {
        kind: 'security_alert',
        payload: { event: input.event, at: new Date().toISOString() },
        user_id: input.userId,
        recipient_email: input.email ?? '',
      },
      siteUrl(),
    )
    if (result.outcome === 'retry') {
      log.warn('auth.security_alert_push_retry', { event: input.event, reason: result.reason })
    }
  } catch (error) {
    log.warn('auth.security_alert_push_threw', {
      event: input.event,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}
