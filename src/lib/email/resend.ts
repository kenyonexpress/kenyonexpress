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
 */

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  /** Same key for the same logical email; Resend deduplicates on it. */
  idempotencyKey?: string
  replyTo?: string
}

export type SendEmailResult =
  | { ok: true; id: string | null; skipped?: false }
  | { ok: false; skipped: true; reason: 'no_api_key'; retryable?: false }
  | { ok: false; skipped?: false; reason: string; retryable: boolean }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Which failures are worth trying again.
 *
 * 429 is rate limiting and 5xx is Resend having a bad minute: both end on their
 * own, so the row waits and goes back out. Every other 4xx is a statement about
 * this particular message - a malformed address, an unverified sender, a body
 * Resend refused - and it will be refused identically in two minutes and in two
 * hours. Retrying those spends five attempts to arrive at the same answer, and
 * delays the moment an admin sees a `dead` row and fixes the real problem.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** Verified sender. A domain Resend has not verified will be refused by Resend. */
export function mailFrom(): string {
  return process.env.EMAIL_FROM ?? 'KenyonExpress <noreply@kenyonexpress.co.il>'
}

let missingKeyReported = false

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (!missingKeyReported) {
      missingKeyReported = true
      console.warn('[email] RESEND_API_KEY is not set; outbound email is disabled in this process.')
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
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(`[email] resend refused ${response.status}: ${detail.slice(0, 300)}`)
      return {
        ok: false,
        reason: `http_${response.status}`,
        retryable: isRetryableStatus(response.status),
      }
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: body?.id ?? null }
  } catch (error) {
    console.error(`[email] send failed: ${error instanceof Error ? error.message : String(error)}`)
    // A connection that never completed says nothing about the message itself.
    return { ok: false, reason: 'network', retryable: true }
  }
}

/** Test seam. Never called by application code. */
export function __resetEmailWarning(): void {
  missingKeyReported = false
}
