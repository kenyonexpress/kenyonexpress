/**
 * THE STAGING GATE (STEP 69).
 *
 * `staging.kenyonexpress.co.il` is a second Vercel project built from the same
 * repo, pointed at the Supabase branch `staging`. It must not be reachable by
 * a stranger or a crawler: it carries the next deploy before anyone has looked
 * at it, a mock payment provider that "charges" nothing, and a catalogue of
 * demo rows next to a copy of the real one. Vercel's own password protection
 * is an Enterprise add-on on this plan, and its free SSO wall is applied to
 * the `*.vercel.app` alias only (`ssoProtection.deploymentType =
 * all_except_custom_domains`, read 2026-10-14), so on the custom domain this
 * file is the whole door.
 *
 * ONE VARIABLE, SET ON ONE PROJECT. `STAGING_PASSWORD` exists in the staging
 * project's environment and nowhere else. Set, the proxy answers every
 * browser request that does not carry the password with `401` and a Basic
 * challenge; the browser asks once and resends the credential on every
 * request to the origin after that, including Server Action POSTs, so no
 * cookie is minted and nothing has to be signed. Unset, this module is inert
 * and the proxy does not change: production never carries the variable, and
 * `scripts/deploy-preflight.mjs` refuses a build that carries it together
 * with the production host, because with the password a shop is locked to
 * its customers and without it a staging is open to the world.
 *
 * TWO WAYS IN. A browser sends `Authorization: Basic base64(user:password)`;
 * the user part is ignored, only the password is compared. A machine (the
 * smoke probe, the Playwright suite) sends the password in
 * `x-staging-password`, so it does not have to fight a `WWW-Authenticate`
 * round trip or share the `Authorization` header with anything else.
 *
 * WHAT IS NOT GATED, AND WHY EACH ONE. Paths a machine calls with its own
 * credential, where a Basic challenge would be answered by nothing and the
 * `Authorization` header is already taken:
 *   - `/monitoring`          the Sentry tunnel, posted by the browser SDK on a
 *                            page that may already be broken
 *   - `/api/cron/*`          Vercel's scheduler and the external one send
 *                            `Authorization: Bearer CRON_SECRET`
 *   - `/api/payments/*`      Cardcom's callbacks carry no browser headers
 *   - `/api/webhooks/*`      Twilio, image and product webhooks, each with
 *                            its own secret
 *   - `/api/alerts/*`        Sentry and UptimeRobot alert webhooks
 *   - `/api/jobs/*`          QStash, signed
 *   - `/api/app/*`, `/api/supplier/app`
 *                            the till app (`apps/mobile`) with its own session
 *   - `/api/health`, `/api/ready`
 *                            uptime probes and the smoke; the health body is
 *                            coarse by design and leaks nothing
 *   - `/api/revalidate`      bearer-guarded cache purge
 * Everything else, including `/api/search`, `/api/cart` and every page, is
 * behind the password. Static assets are not reached by the proxy at all
 * (its matcher skips `_next/static` and images), which is the same shape
 * Vercel's protection has.
 *
 * EDGE-SAFE. No `node:crypto`: the proxy runs on the edge runtime, where
 * `timingSafeEqual` does not exist, so the compare below is a plain XOR fold
 * over both strings with the length folded in, which does not stop at the
 * first differing character.
 */

export const STAGING_PASSWORD_HEADER = 'x-staging-password'
export const STAGING_REALM = 'KenyonExpress Staging'
export const STAGING_ROBOTS_TAG = 'noindex, nofollow'

/** Prefixes (matched with the trailing slash, or exactly) and exact paths the gate lets through. */
export const STAGING_GATE_EXEMPT_PREFIXES = [
  '/monitoring/',
  '/api/cron/',
  '/api/payments/',
  '/api/webhooks/',
  '/api/alerts/',
  '/api/jobs/',
  '/api/app/',
] as const

export const STAGING_GATE_EXEMPT_EXACT = [
  '/api/health',
  '/api/ready',
  '/api/revalidate',
  '/api/supplier/app',
] as const

export type StagingGateDecision =
  | { kind: 'pass'; via: 'exempt' | 'header' | 'basic' }
  | { kind: 'challenge'; reason: 'missing' | 'wrong' }

/** The gate's password, or null when the environment does not carry one (every environment but staging). */
export function stagingPasswordFromEnv(env: Record<string, string | undefined>): string | null {
  const value = env.STAGING_PASSWORD?.trim()
  return value ? value : null
}

export function isStagingGateExempt(pathname: string): boolean {
  for (const exact of STAGING_GATE_EXEMPT_EXACT) {
    if (pathname === exact) return true
  }
  for (const prefix of STAGING_GATE_EXEMPT_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
    // `/monitoring` itself, `/api/cron` without a trailing slash: the prefix
    // minus its slash, as an exact path. `/monitoring-x` is neither.
    if (pathname === prefix.slice(0, -1)) return true
  }
  return false
}

/**
 * Equal, without the comparison saying how much of the guess was right. The
 * length difference is folded into the result instead of short-circuiting on
 * it; the loop always runs over the longer of the two.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** The password out of an `Authorization: Basic …` header, or null when the header is not that shape. */
export function basicAuthPassword(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header)
  if (!match?.[1]) return null
  let decoded: string
  try {
    decoded = atob(match[1])
  } catch {
    return null
  }
  // RFC 7617: user-id ":" password, and the user-id may not contain a colon,
  // so the first colon is the split. A token with no colon is taken as the
  // password alone, for a client that was told "any user".
  const colon = decoded.indexOf(':')
  return colon === -1 ? decoded : decoded.slice(colon + 1)
}

type HeaderReader = { get(name: string): string | null }

export function stagingGateDecision(
  input: { pathname: string; headers: HeaderReader },
  password: string,
): StagingGateDecision {
  if (isStagingGateExempt(input.pathname)) return { kind: 'pass', via: 'exempt' }

  const header = input.headers.get(STAGING_PASSWORD_HEADER)
  if (header !== null) {
    if (constantTimeEqual(header, password)) return { kind: 'pass', via: 'header' }
    return { kind: 'challenge', reason: 'wrong' }
  }

  const basic = basicAuthPassword(input.headers.get('authorization'))
  if (basic !== null) {
    if (constantTimeEqual(basic, password)) return { kind: 'pass', via: 'basic' }
    return { kind: 'challenge', reason: 'wrong' }
  }

  return { kind: 'challenge', reason: 'missing' }
}

/**
 * The 401. `WWW-Authenticate` is what makes a browser show its password
 * dialog; `charset="UTF-8"` tells it how to encode what the user types.
 * `no-store` so no cache, shared or private, keeps the challenge page, and
 * the robots tag so a crawler that somehow arrives learns nothing worth
 * keeping. Hebrew, RTL, no scripts and no styles: the proxy stamps the
 * request's CSP on this response like on every other and the body must not
 * need an exception from it.
 */
export function stagingChallengeResponse(): Response {
  const body =
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex, nofollow"><title>סביבת הבדיקות של KenyonExpress</title></head>' +
    '<body><h1>סביבת הבדיקות של KenyonExpress</h1>' +
    '<p>הכניסה לסביבה הזו דורשת סיסמה. אפשר להקליד כל שם משתמש; הסיסמה היא שקובעת.</p>' +
    '<p>האתר עצמו נמצא בכתובת <a href="https://www.kenyonexpress.co.il">www.kenyonexpress.co.il</a>.</p>' +
    '</body></html>'
  return new Response(body, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${STAGING_REALM}", charset="UTF-8"`,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': STAGING_ROBOTS_TAG,
    },
  })
}
