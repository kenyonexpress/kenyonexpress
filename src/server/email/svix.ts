import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Svix webhook signature verification, which is what Resend signs with.
 *
 * NO SDK. This is one HMAC and a timestamp comparison, and `svix` would be a
 * dependency in the path that decides whether an unauthenticated POST may write
 * to the suppression list - a dependency that then has to be audited and
 * updated forever. `src/lib/growth/resend.ts` gives the same reasoning for
 * calling Resend's REST API over fetch, and `server/whatsapp/twilio.ts`
 * verifies Twilio's HMAC by hand for the same reason.
 *
 * THE SCHEME, from Svix's documentation:
 *
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature      = base64(HMAC-SHA256(base64decode(secret after `whsec_`), content))
 *   header         = `v1,<sig> v1,<sig2> ...`   space separated, several during
 *                                               a secret rotation
 *
 * THE RAW BODY IS SIGNED, NOT THE PARSED ONE. `JSON.parse` then
 * `JSON.stringify` changes key order and number formatting, and the signature
 * would fail for reasons that look like a wrong secret. The route reads
 * `request.text()` once and hands the same string to both this and the parser.
 *
 * THE TIMESTAMP IS CHECKED, and that is not decoration: without it a signature
 * captured once is valid forever, and replaying an `email.bounced` is a way to
 * suppress somebody else's mail permanently.
 */

/** Svix's own tolerance, and the one its libraries use. */
export const SVIX_TOLERANCE_SECONDS = 300

export type SvixHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'missing_headers' | 'stale' | 'bad_signature' }

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  // `timingSafeEqual` throws on unequal lengths, so the length is compared
  // first and is allowed to leak - the same trade `lib/security/constant-time.ts`
  // documents. A signature's length is fixed by the algorithm anyway.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function verifySvixSignature(args: {
  secret: string | undefined
  headers: SvixHeaders
  body: string
  nowSeconds?: number
}): VerifyResult {
  const { secret, headers, body } = args
  if (!secret) return { ok: false, reason: 'not_configured' }
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing_headers' }
  }

  const sent = Number.parseInt(headers.timestamp, 10)
  if (!Number.isFinite(sent)) return { ok: false, reason: 'stale' }
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000)
  // Both directions. A timestamp far in the FUTURE is as much a replay tell as
  // one far in the past, and clock skew between two machines is seconds.
  if (Math.abs(now - sent) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' }

  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const keyBytes = Buffer.from(raw, 'base64')
  if (keyBytes.length === 0) return { ok: false, reason: 'not_configured' }

  const expected = createHmac('sha256', keyBytes)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest('base64')

  // Several `v1,<sig>` pairs arrive while a secret is being rotated, and any
  // one of them matching is a valid message. Versions other than v1 are
  // ignored rather than refused, so a future scheme does not break this one.
  for (const part of headers.signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    if (constantTimeEquals(value, expected)) return { ok: true }
  }

  return { ok: false, reason: 'bad_signature' }
}
