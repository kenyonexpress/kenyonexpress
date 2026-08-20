/**
 * The Resend transport for the three `notify-*` functions.
 *
 * Resend only. The project forbids Make and Zapier on the notification path,
 * and this is the single place an outbound message leaves the Edge runtime.
 *
 * THREE THINGS IT DOES THAT THE OLDER `channels/resend.ts` DOES NOT.
 *
 *   1. **Attachments with `content_id`.** That is how the coupon QR reaches an
 *      inbox at all: an inline `data:` URI is stripped by Gmail and by most
 *      corporate filters, while a `cid:` reference to a real attachment is the
 *      case they were built to permit.
 *
 *   2. **It reports the provider's message id.** `notification_log` stores it,
 *      and it is the only handle the Resend dashboard understands when
 *      somebody asks what happened to one specific email.
 *
 *   3. **It distinguishes retryable from terminal.** A 4xx that is not 429 will
 *      say the same thing on the fifth attempt as on the first — a malformed
 *      address, an unverified sender — so retrying it burns the row's attempts
 *      and delays nothing but the eventual give-up. Only 429 and 5xx and a
 *      network error are worth coming back for.
 *
 * IT NEVER THROWS. Every caller is draining a queue: one bad row must not stop
 * the batch, and the row's own settle path is where the failure is recorded.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface EmailAttachment {
  filename: string
  /** Base64, no `data:` prefix. */
  content: string
  /** Set to reference the file from the HTML as `cid:<value>`. */
  contentId?: string
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
  attachments?: readonly EmailAttachment[]
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; retryable: boolean; reason: string }

/** Verified sender. A domain Resend has not verified will be refused by Resend. */
export function mailFrom(): string {
  return Deno.env.get('EMAIL_FROM') ?? 'KenyonExpress <noreply@kenyonexpress.co.il>'
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    // Terminal, not retryable: a key that is not configured will still not be
    // configured in two minutes, and four more attempts prove nothing.
    return { ok: false, retryable: false, reason: 'no_api_key' }
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  }
  if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey

  const body: Record<string, unknown> = {
    from: mailFrom(),
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  }
  if (input.replyTo) body.reply_to = input.replyTo
  if (input.attachments && input.attachments.length > 0) {
    body.attachments = input.attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      ...(file.contentId ? { content_id: file.contentId } : {}),
      ...(file.contentType ? { content_type: file.contentType } : {}),
    }))
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const retryable = response.status === 429 || response.status >= 500
      return {
        ok: false,
        retryable,
        reason: `http_${response.status}: ${detail.slice(0, 200)}`,
      }
    }

    const parsed = (await response.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: parsed?.id ?? null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, retryable: true, reason: `network: ${message.slice(0, 200)}` }
  }
}
