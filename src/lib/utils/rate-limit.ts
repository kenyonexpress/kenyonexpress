import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

/**
 * THIS IS ONLY AN IDENTITY BECAUSE A PROXY OVERWRITES THE HEADER. NAME IT.
 *
 * `x-forwarded-for` arrives from the network, and nothing here distinguishes a
 * value the platform wrote from one the caller typed. MEASURED against this app
 * on localhost: three requests to `/api/search` sent with different
 * `x-forwarded-for` values produced three separate rows in `rate_limits` -
 * `search:203.0.113.77`, `search:198.51.100.9`, `search:::1`. Directly from the
 * client's header, one bucket each.
 *
 * With no proxy in front, therefore, EVERY IP-KEYED LIMIT IN THIS APP IS ONE
 * HEADER AWAY FROM BEING NO LIMIT: login attempts, guest cart writes, the
 * contact form, the supplier lead form. The reverse is worse - a caller who
 * puts SOMEBODY ELSE'S address here spends that person's budget for them.
 *
 * In production the app sits behind Vercel, which sets this header itself, and
 * that is the whole of what makes the key trustworthy. It is an assumption
 * about the deployment, not a property of this code, and it was not written
 * down anywhere before. If this app is ever served from anything that does not
 * overwrite the header - a bare Node process, a misconfigured reverse proxy -
 * these limits are decorative.
 *
 * NOT "hardened" by preferring some other header. `x-real-ip` and
 * `x-vercel-forwarded-for` arrive over the same wire and are exactly as
 * forgeable without a proxy; reordering them would move the assumption rather
 * than remove it, and would need measuring against a real deployment, which
 * this machine has no link to. The same read appears in `api/a/route.ts`,
 * `api/app/session/route.ts` and `vouchers/scan-context.ts`, so a change here
 * is a change to all four. Recorded in `docs/QUESTIONS-FOR-OFIR.md`.
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? headersList.get('x-real-ip') ?? 'unknown'
}

export async function checkRateLimit(
  key: string,
  maxAttempts = 10,
  windowSeconds = 3600,
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // Fail open — don't block legitimate users if rate limit RPC is unavailable
    log.error('rate_limit.check_failed', { reason: error.message })
    return true
  }
  return data === true
}

export async function checkUserRateLimit(
  userId: string,
  action: string,
  maxAttempts = 100,
  windowSeconds = 3600,
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('check_user_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_limit: maxAttempts,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // Fail open — don't block legitimate users if rate limit RPC is unavailable
    log.error('rate_limit.user_check_failed', { reason: error.message })
    return true
  }
  return data === true
}
