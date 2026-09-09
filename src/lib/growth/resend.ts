import 'server-only'

import { countEmailEvent, isSuppressed } from '@/lib/email/suppression'

/**
 * Resend, over fetch. No SDK.
 *
 * Same reasoning as scripts/wp-import/lib/r2.mjs: this is three REST calls, and
 * a dependency in the path that sends mail to customers is a dependency that
 * has to be audited and updated forever. The API is stable and documented.
 *
 * Entirely inert without RESEND_API_KEY. Every function returns a skipped
 * result rather than throwing, so local development and CI need no credential
 * and a missing key never takes down a checkout that happens to trigger a send.
 */

const API = 'https://api.resend.com'

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string }

function key(): string | null {
  return process.env.RESEND_API_KEY ?? null
}

export function isResendConfigured(): boolean {
  return Boolean(key())
}

async function call(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

export type SendArgs = {
  to: string
  subject: string
  html: string
  /** The RFC 8058 one-click unsubscribe URL. Required for any marketing send. */
  unsubscribeUrl?: string
  tag?: string
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  // The suppression check is FIRST, before the key check, and it is here as
  // well as in `lib/email/resend.ts` because these are two senders that share
  // nothing but the provider. This one carries marketing, which is the mail a
  // complaint is actually about: sending it to an address that pressed "spam"
  // is the single strongest signal Gmail has for classifying a whole domain.
  if (await isSuppressed(args.to)) return { ok: false, skipped: true }

  if (!key()) return { ok: false, skipped: true }

  // Falls through to EMAIL_FROM, which is what the transactional sender in
  // src/lib/email/resend.ts reads. One verified domain configures both, and a
  // deploy that set only EMAIL_FROM does not silently mail marketing from a
  // hardcoded address nobody verified. RESEND_FROM stays as the override for
  // when marketing wants its own sender identity.
  const from =
    process.env.RESEND_FROM ??
    process.env.EMAIL_FROM ??
    'KenyonExpress <noreply@kenyonexpress.co.il>'

  // List-Unsubscribe is not optional on marketing mail. Without it Gmail and
  // Yahoo route bulk senders to spam outright, and the person who wanted out
  // presses the spam button instead, which costs the sending domain far more
  // than the unsubscribe would have.
  const headers: Record<string, string> = {}
  if (args.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${args.unsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const res = await call('/emails', {
    method: 'POST',
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      headers: Object.keys(headers).length ? headers : undefined,
      tags: args.tag ? [{ name: 'kind', value: args.tag }] : undefined,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` }
  }
  // Counted against the same per-day, per-template counters the transactional
  // sender uses. Resend has no `email.sent` event, so without this the
  // denominator for every rate is missing. The tag NAME here is `kind` and the
  // transactional sender's is `template`; the webhook reads either, and the
  // names are left alone because renaming a tag that is already going out on
  // live mail would orphan the events already in flight.
  await countEmailEvent(args.tag ?? 'unknown', 'sent')
  const body = (await res.json()) as { id?: string }
  return { ok: true, id: body.id ?? '' }
}

/**
 * Adds or updates a contact in the Resend audience.
 *
 * Our database is the source of truth for consent, not Resend's. This mirrors
 * a decision already made and recorded here; it never reads state back, because
 * a subscriber list that can be edited in two places drifts, and the copy that
 * is legally load-bearing is ours.
 */
export async function syncAudienceContact(args: {
  email: string
  subscribed: boolean
  firstName?: string | null
}): Promise<{ ok: boolean; id?: string; error?: string; skipped?: boolean }> {
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (!key() || !audienceId) return { ok: false, skipped: true }

  const res = await call(`/audiences/${audienceId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      email: args.email,
      first_name: args.firstName ?? undefined,
      // Resend's own flag. Kept in step with ours so a send initiated from
      // their dashboard cannot reach someone who opted out here.
      unsubscribed: !args.subscribed,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, error: `resend audience ${res.status}: ${detail.slice(0, 200)}` }
  }
  const body = (await res.json()) as { id?: string }
  return { ok: true, id: body.id }
}
