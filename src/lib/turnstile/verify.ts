import { createHmac, timingSafeEqual } from 'node:crypto'
import { turnstileConfig, turnstileErrorText, verifyTurnstile } from '@/lib/fraud/turnstile'

/**
 * The form-level Turnstile gate the server actions call.
 *
 * NOT A SECOND VERIFIER. Talking to Cloudflare, and the three failure modes
 * (unconfigured allows, bad token refuses, Cloudflare down allows and logs),
 * live in `lib/fraud/turnstile.ts` and stay there. This file is the two shapes
 * a caller actually needs on top of it:
 *
 *   1. `verifyTurnstileForm` - read the field the widget injected into the
 *      FormData and answer with the Hebrew refusal or nothing. Used where the
 *      widget sits inside the form the action receives: /login, /signup.
 *
 *   2. A short-lived PASS, for /suppliers/apply. That wizard's `<form>` is a
 *      frozen file (design-locked-2026-10-19), and implicit Turnstile only
 *      writes its token into the form that encloses it, so the challenge is
 *      solved in a gate form in front of the wizard instead. The gate action
 *      verifies the token and sets an HMAC cookie bound to the user id; the
 *      wizard's submit action re-checks the cookie. The server still decides at
 *      submit time, not the page that chose to render the wizard.
 */

export const TURNSTILE_FIELD = 'cf-turnstile-response'

export type TurnstileFormResult = { ok: true } | { ok: false; error: string }

export async function verifyTurnstileForm(
  formData: FormData,
  remoteIp?: string,
  source: NodeJS.ProcessEnv = process.env,
): Promise<TurnstileFormResult> {
  const token = formData.get(TURNSTILE_FIELD)
  const outcome = await verifyTurnstile(typeof token === 'string' ? token : null, remoteIp, source)
  return outcome.ok ? { ok: true } : { ok: false, error: turnstileErrorText() }
}

// ──────────────────────────────────────────────
// The pass cookie
// ──────────────────────────────────────────────

export const TURNSTILE_PASS_COOKIE = 'ke_ts_pass'

/** Long enough to fill the four wizard steps, short enough to be worth nothing resold. */
export const TURNSTILE_PASS_TTL_SECONDS = 30 * 60

function sign(payload: string, secret: string): string {
  // Keyed off the Turnstile secret with a purpose prefix, so the cookie needs
  // no secret of its own and rotating the Turnstile key revokes every pass.
  return createHmac('sha256', `turnstile-pass:${secret}`).update(payload).digest('base64url')
}

/** `<subject>.<expiresAtSeconds>.<mac>`. Null when Turnstile is not configured. */
export function issueTurnstilePass(
  subject: string,
  nowMs: number = Date.now(),
  source: NodeJS.ProcessEnv = process.env,
): string | null {
  const config = turnstileConfig(source)
  if (!config) return null
  const expires = Math.floor(nowMs / 1000) + TURNSTILE_PASS_TTL_SECONDS
  const payload = `${subject}.${expires}`
  return `${payload}.${sign(payload, config.secretKey)}`
}

/**
 * True when the cookie is a live pass for this subject, OR when Turnstile is
 * not configured - the same "not enforced" answer `verifyTurnstile` gives, so
 * an environment without keys is not locked out of applying.
 */
export function checkTurnstilePass(
  value: string | null | undefined,
  subject: string,
  nowMs: number = Date.now(),
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = turnstileConfig(source)
  if (!config) return true
  if (!value) return false

  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [cookieSubject, expiresRaw, mac] = parts as [string, string, string]
  if (cookieSubject !== subject) return false

  const expires = Number(expiresRaw)
  if (!Number.isInteger(expires) || expires <= Math.floor(nowMs / 1000)) return false

  const expected = Buffer.from(sign(`${cookieSubject}.${expiresRaw}`, config.secretKey))
  const given = Buffer.from(mac)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
