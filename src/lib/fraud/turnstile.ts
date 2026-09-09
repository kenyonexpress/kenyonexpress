import { log } from '@/lib/observability/log'

/**
 * Cloudflare Turnstile verification.
 *
 * THE TWO FAILURE MODES ARE NOT THE SAME AND ARE NOT TREATED THE SAME. That is
 * the whole content of this file, and getting it wrong turns a bot control into
 * an outage:
 *
 *   1. NOT CONFIGURED -> allow, and say so. No environment this repo can see
 *      holds a Turnstile key today. If an absent secret refused every signup and
 *      every checkout, merging this would take the shop down, which is how a
 *      security improvement lands as an incident. Same reasoning, same shape as
 *      `UPSTASH_REDIS_REST_*` in `lib/env.ts`.
 *
 *   2. CONFIGURED AND THE TOKEN IS BAD -> refuse. This is the only refusal here,
 *      and it is the one a bot hits.
 *
 *   3. CONFIGURED AND CLOUDFLARE IS UNREACHABLE -> allow, and log at error.
 *      A challenge is a bot control, not an authorisation decision: failing
 *      closed means a Cloudflare incident stops every purchase on this site,
 *      and there is no version of "we could not reach a third party" that is
 *      worth refusing a paying customer over. The log line is the compensating
 *      control and is deliberately loud.
 *
 * BOTH KEYS ARE REQUIRED TO ENFORCE, and that is not belt-and-braces. The
 * widget only renders when the browser has `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, so
 * a deployment with only the secret set would receive no token from any
 * browser and refuse every submission from every real person. Either half alone
 * therefore reads as not configured.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Cloudflare's own always-passing test key pair is not special-cased: it verifies. */
export type TurnstileOutcome = { ok: true; enforced: boolean } | { ok: false; codes: string[] }

export type TurnstileConfig = { siteKey: string; secretKey: string } | null

/**
 * Reads the pair out of an environment. Takes the environment rather than
 * closing over `process.env` so a test can state one, and because
 * `loadCardcomEnv` established that shape here for exactly this reason.
 */
export function turnstileConfig(source: NodeJS.ProcessEnv = process.env): TurnstileConfig {
  const siteKey = source.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  const secretKey = source.TURNSTILE_SECRET_KEY?.trim()
  if (!siteKey || !secretKey) return null
  return { siteKey, secretKey }
}

/** True when a form should render the widget at all. */
export function turnstileEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
  return turnstileConfig(source) !== null
}

/**
 * @param token   the `cf-turnstile-response` field the widget writes into the form
 * @param remoteIp the client address, passed to Cloudflare so it can score it
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
  source: NodeJS.ProcessEnv = process.env,
): Promise<TurnstileOutcome> {
  const config = turnstileConfig(source)
  if (!config) return { ok: true, enforced: false }

  // An empty field with the widget configured means the browser never solved
  // the challenge - script blocked, or a client that is not a browser. Refused
  // without spending a round trip to Cloudflare on it.
  if (!token || token.trim().length === 0) return { ok: false, codes: ['missing-input-response'] }

  const body = new URLSearchParams({ secret: config.secretKey, response: token.trim() })
  // `unknown` is what `getClientIp` hands back with no proxy in front; sending
  // that string to Cloudflare would be a malformed argument, so it is omitted.
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp)

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      // Shorter than the 10s a checkout can afford to lose: this call sits in
      // front of the Cardcom call, and a slow challenge is a slow purchase.
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      log.error('turnstile.siteverify_http_error', { status: response.status })
      return { ok: true, enforced: false }
    }
    const payload = (await response.json()) as {
      success?: boolean
      'error-codes'?: string[]
    }
    if (payload.success === true) return { ok: true, enforced: true }
    return { ok: false, codes: payload['error-codes'] ?? ['unknown'] }
  } catch (error) {
    // Case 3. Loud, because from here on the form is unprotected and nothing
    // else in the system will say so.
    log.error('turnstile.siteverify_unreachable', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return { ok: true, enforced: false }
  }
}

/** One Hebrew sentence for every refusal, because a bare code helps nobody. */
export function turnstileErrorText(): string {
  return 'אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.'
}
