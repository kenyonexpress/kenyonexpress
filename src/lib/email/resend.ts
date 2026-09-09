import { countEmailEvent, isSuppressed } from '@/lib/email/suppression'
import { log } from '@/lib/observability/log'
/**
 * Outbound email through Resend.
 *
 * WHY IT NEVER THROWS. The only caller today is the coupon email, sent from
 * `finalizeOrder` after the card has been charged and the order closed. An
 * unreachable mail provider must not turn a completed purchase into a failed
 * one, and there is nothing the caller could usefully do with the error at that
 * point in the flow. Failures are reported in the return value and logged.
 *
 * WHY AN ABSENT KEY IS NOT AN ERROR. Without `RESEND_API_KEY` this reports
 * `skipped` and says so once per process. Local development and CI have no key
 * and should not have one; a checkout that fails because nobody configured mail
 * on a laptop teaches people to ignore the failure.
 *
 * `idempotencyKey` is passed to Resend's own header, so a finalize that runs
 * twice (the webhook and the return page both reconcile the same order) sends
 * one email rather than two.
 *
 * IT IS THE SUPPRESSION CHOKEPOINT ([60]). Nine call sites reach this function
 * and none of them goes through `fn_enqueue_notification`, which is where the
 * suppression check has lived since 095 - so before this, a hard-bounced
 * address was suppressed for outbox mail and mailed by the coupon delivery, the
 * magic link, the weekly digest, the abandoned-cart nudge and the rest. One
 * check here covers all nine, which is the reason it is here rather than in
 * each caller.
 *
 * `tag` names the template for `email_events_daily`. Untagged sends are counted
 * under `unknown` rather than dropped, so a call site that forgets is visible
 * rather than invisible.
 */

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  /** Same key for the same logical email; Resend deduplicates on it. */
  idempotencyKey?: string
  replyTo?: string
  /**
   * Which template this is, for the per-day counters. Sent to Resend as a tag
   * so its webhook events carry it back and a delivery can be attributed to a
   * template without storing who received it.
   *
   * Resend tag values are restricted to ASCII letters, digits, underscore and
   * hyphen, so the value is normalised rather than trusted: a Hebrew template
   * name would otherwise be rejected by the API and take the whole send with it.
   */
  tag?: string
}

/** Resend refuses a tag outside `[A-Za-z0-9_-]`, and a refused send sends nothing. */
function safeTag(tag: string | undefined): string | null {
  const cleaned = (tag ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 64)
  return cleaned.length > 0 ? cleaned : null
}

export type SendEmailResult =
  | { ok: true; id: string | null; skipped?: false }
  | { ok: false; skipped: true; reason: 'no_api_key' | 'suppressed' }
  | { ok: false; skipped?: false; reason: string }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Verified sender. A domain Resend has not verified will be refused by Resend. */
export function mailFrom(): string {
  return process.env.EMAIL_FROM ?? 'KenyonExpress <noreply@kenyonexpress.co.il>'
}

let missingKeyReported = false

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  // BEFORE the key check, so a machine with no key still reports a suppressed
  // address as suppressed rather than as unconfigured - which is what a test
  // and a local run should see.
  if (await isSuppressed(input.to)) {
    log.info('email.suppressed', { tag: safeTag(input.tag) ?? 'unknown' })
    return { ok: false, skipped: true, reason: 'suppressed' }
  }

  if (!apiKey) {
    if (!missingKeyReported) {
      missingKeyReported = true
      log.warn('email.disabled', { reason: 'RESEND_API_KEY is not set' })
    }
    return { ok: false, skipped: true, reason: 'no_api_key' }
  }

  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }
    if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: mailFrom(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(safeTag(input.tag)
          ? { tags: [{ name: 'template', value: safeTag(input.tag) as string }] }
          : {}),
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      log.error('email.refused', { status: response.status, detail: detail.slice(0, 300) })
      return { ok: false, reason: `http_${response.status}` }
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null
    // Counted here and not in the webhook, because Resend has no `email.sent`
    // event: the first thing it reports is `delivered`, so without this the
    // denominator for every rate is missing and a template that is refused at
    // the API would look like a template nobody opens.
    await countEmailEvent(safeTag(input.tag) ?? 'unknown', 'sent')
    return { ok: true, id: body?.id ?? null }
  } catch (error) {
    log.error('email.send_failed', { err: error })
    return { ok: false, reason: 'network' }
  }
}

/** Test seam. Never called by application code. */
export function __resetEmailWarning(): void {
  missingKeyReported = false
}
