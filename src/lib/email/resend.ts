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
 */

/**
 * A file carried by the mail. Bytes are base64-encoded on the wire, which
 * is the only form Resend's JSON endpoint accepts; the caller keeps its
 * `Uint8Array` and never has to know that.
 */
export interface EmailAttachment {
  filename: string
  content: Uint8Array
  contentType?: string
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  /** Same key for the same logical email; Resend deduplicates on it. */
  idempotencyKey?: string
  replyTo?: string
  /**
   * Attached files, e.g. the tax document PDF. Omitted from the request
   * body entirely when empty, so a mail without one is byte-identical to
   * what was sent before attachments existed.
   */
  attachments?: readonly EmailAttachment[]
}

/** The wire shape of one attachment. Exported for the test that pins it. */
export function serializeAttachment(attachment: EmailAttachment): {
  filename: string
  content: string
  content_type?: string
} {
  return {
    filename: attachment.filename,
    content: Buffer.from(attachment.content).toString('base64'),
    ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
  }
}

export type SendEmailResult =
  | { ok: true; id: string | null; skipped?: false }
  | { ok: false; skipped: true; reason: 'no_api_key' }
  | { ok: false; skipped?: false; reason: string }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

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
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments.map(serializeAttachment) }
          : {}),
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      log.error('email.refused', { status: response.status, detail: detail.slice(0, 300) })
      return { ok: false, reason: `http_${response.status}` }
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null
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
