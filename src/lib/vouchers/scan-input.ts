/**
 * What the counter actually points its camera at, turned into something the
 * redeem API accepts.
 *
 * Three things can arrive, and only the first two used to be handled:
 *
 *   1. a bare signed token, `KEV1.<body>.<mac>`
 *   2. a hand-typed short code, `ABCDE-FGHJK`
 *   3. a redeem URL, `https://host/redeem/KEV1.<body>.<mac>`
 *
 * The third is what a QR should encode, because a phone's built-in camera has
 * no idea what a KEV1 string is and will offer to search the web for it, while
 * a URL opens /redeem/[token] and lands the cashier on the confirm screen. The
 * in-app scanner therefore has to accept both, which is what this module is
 * for. It is pure and client-safe: no signature is checked here, and nothing it
 * returns is trusted. verifyVoucherQrPayload on the server is what decides
 * whether a token is real.
 */

export type ScanInput =
  | { kind: 'token'; token: string; code: string | null }
  | { kind: 'code'; token: null; code: string }
  | { kind: 'invalid'; token: null; code: null }

export const VOUCHER_TOKEN_PREFIX = 'KEV1.'

/** Same normalisation as domain/vouchers/code.ts, duplicated to stay client-safe. */
export function normalizeScannedCode(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** Matches the DB CHECK vouchers_code_format. I, L, O and U are not in the alphabet. */
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/

/**
 * Pulls the token out of anything a scanner can hand us.
 *
 * A token is taken whole and never normalised: it is base64url with dots, and
 * stripping the punctuation would destroy the signature. Only the short code
 * is upper-cased and de-hyphenated.
 */
export function parseScanInput(raw: string): ScanInput {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { kind: 'invalid', token: null, code: null }

  const fromUrl = tokenFromRedeemUrl(trimmed)
  const token = fromUrl ?? (trimmed.startsWith(VOUCHER_TOKEN_PREFIX) ? trimmed : null)

  if (token) {
    // Three dot-separated parts, or it cannot be a KEV1 token at all.
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1] || !parts[2]) {
      return { kind: 'invalid', token: null, code: null }
    }
    return { kind: 'token', token, code: null }
  }

  const code = normalizeScannedCode(trimmed)
  if (CODE_PATTERN.test(code)) return { kind: 'code', token: null, code }

  return { kind: 'invalid', token: null, code: null }
}

/**
 * `KEV1...` out of a /redeem/<token> URL, or null.
 *
 * Any host is accepted. The QR was minted by us but is scanned on a device we
 * do not control, and refusing a token because it came through a shortener or a
 * staging host would fail a real customer at a till; the HMAC is what proves
 * provenance, and it is checked server-side regardless of the URL it arrived in.
 */
export function tokenFromRedeemUrl(raw: string): string | null {
  const match = /\/redeem\/([^/?#\s]+)/.exec(raw)
  if (!match?.[1]) return null
  let candidate = match[1]
  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    // A stray percent sign is not a reason to drop the scan.
  }
  return candidate.startsWith(VOUCHER_TOKEN_PREFIX) ? candidate : null
}

/**
 * The URL a voucher QR encodes. Trailing slashes are trimmed so a misconfigured
 * NEXT_PUBLIC_APP_URL cannot produce `//redeem/...`, which is a
 * protocol-relative path once it reaches a browser.
 */
export function buildRedeemUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/redeem/${encodeURIComponent(token)}`
}
