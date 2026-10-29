import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { log } from '@/lib/observability/log'

/**
 * Cloudflare Turnstile on every public form a bot can reach: checkout,
 * supplier/apply, contact, signup and login.
 *
 * Flag `turnstile_enabled` (env `NEXT_PUBLIC_TURNSTILE_ENABLED`, so server and
 * widget agree): ON only if both keys are present, and an explicit `0`/`false`
 * switches it off even then. While off the check passes, so the forms keep
 * working and the honeypot and rate limits remain the defence. While on, a
 * missing or rejected token fails closed.
 */
export function turnstileEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.TURNSTILE_SECRET_KEY || !env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return false
  const flag = env.NEXT_PUBLIC_TURNSTILE_ENABLED?.trim().toLowerCase()
  return flag !== '0' && flag !== 'false'
}

export const turnstileConfigured = turnstileEnabled

export const TURNSTILE_FIELD = 'cf-turnstile-response'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

let warnedMissingKey = false

export async function verifyTurnstile(
  token: FormDataEntryValue | null,
  ip?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret || !turnstileEnabled(env)) {
    if (!warnedMissingKey) {
      log.warn('turnstile.env_missing', {
        message: 'TURNSTILE_SECRET_KEY not set, verification skipped. See docs/TURNSTILE-SETUP.md',
      })
      warnedMissingKey = true
    }
    return true
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false
  const body = new URLSearchParams({ secret, response: token })
  if (ip && ip !== 'unknown') body.set('remoteip', ip)
  try {
    const res = await fetchWithTimeout(VERIFY_URL, { method: 'POST', body, timeoutMs: 5000 })
    if (!res.ok) return false
    const json = (await res.json()) as { success?: boolean }
    return json.success === true
  } catch {
    return false
  }
}
