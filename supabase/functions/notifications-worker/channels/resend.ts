/**
 * Edge Resend channel (reference twin of src/lib/email/resend.ts).
 *
 * The production Edge worker currently proxies to the Next drain so RTL
 * templates stay single-sourced. Keep this adapter if the worker later renders
 * and sends in Deno without hopping to Vercel.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export function mailFrom(): string {
  return Deno.env.get('EMAIL_FROM') ?? 'KenyonExpress <noreply@kenyonexpress.co.il>'
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: 'no_api_key' }
  | { ok: false; skipped?: false; reason: string }

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { ok: false, skipped: true, reason: 'no_api_key' }

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
      }),
    })
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` }
    }
    const body = (await response.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: body?.id ?? null }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
