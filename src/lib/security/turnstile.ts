import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

/**
 * Cloudflare Turnstile, on the two public forms a bot can reach without an
 * account: contact and signup.
 *
 * OFF UNLESS CONFIGURED, like phone sign-in. The widget needs a site key and
 * the check needs a secret, both created in the Cloudflare dashboard. Until
 * `TURNSTILE_SECRET_KEY` is set the check passes, so the forms keep working and
 * the honeypot and rate limits remain the defence. Once it is set, a missing or
 * rejected token fails closed.
 */
export function turnstileConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY)
}

export const TURNSTILE_FIELD = 'cf-turnstile-response'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(
  token: FormDataEntryValue | null,
  ip?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret) return true
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
