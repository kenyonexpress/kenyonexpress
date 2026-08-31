import { log } from '@/lib/observability/log'
import { rateLimitByKey } from '@/lib/rate-limit/limiter'
import { legacyRedisKey } from '@/lib/rate-limit/policies'
import { createAdminClient } from '@/lib/supabase/admin'
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

/**
 * THE LIMITER RUNS ON THE SERVICE KEY, AND THAT IS THE SECURITY PROPERTY.
 *
 * Both functions below used to call `createClient()`, the cookie-bound client,
 * so the RPC executed as `anon` or `authenticated`. `check_rate_limit` needs
 * EXECUTE for whichever role calls it, and the publishable key is public by
 * definition, so that grant was reachable by anyone with a terminal:
 *
 *   POST /rest/v1/rpc/check_rate_limit
 *   {"p_key": "phone-otp-number:+972500000000", "p_max_attempts": 1}
 *
 * MEASURED against production on 2026-08-21: `check_rate_limit` is
 * SECURITY DEFINER with `anon=X` and `authenticated=X`, and its body inserts
 * `p_key` verbatim, incrementing the counter BEFORE comparing it to
 * `p_max_attempts`. The counter therefore moves no matter what limit the caller
 * passes. Every key in this codebase is guessable - `login:<ip>`,
 * `phone-otp-number:<e164>`, `reset-address:<email>`, `contact:<ip>`,
 * `cart_write:user:<uuid>` - so five anonymous calls spend a real person's OTP
 * budget and lock them out of signing in for the hour. The same call is also an
 * unbounded INSERT of attacker-chosen rows into `rate_limits`.
 *
 * Nothing on this path is ever reached from a browser: every caller is a server
 * action or a route handler. So the limiter uses the service-role client, which
 * `src/lib/health/checks.ts` already proved works for this RPC, and
 * `migrations/pending/145_revoke_check_rate_limit_execute.sql` revokes the
 * anon/authenticated grant behind it.
 *
 * ORDER MATTERS AND IS ONE-WAY: this file must be deployed BEFORE 145 is
 * applied. Apply 145 first and the RPC starts returning 42501 to a still-live
 * caller, and the fail-open below turns every limit in the app off silently.
 */
function adminClientOrNull(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient()
  } catch (error) {
    // `createAdminClient` throws only when the key is absent, which is a
    // deployment fault rather than anything the caller did. It fails open like
    // every other error on this path - but loudly, because a limiter that is
    // off and quiet is the exact failure `checkRateLimiter` in the health
    // report exists to catch.
    log.error('rate_limit.admin_client_unavailable', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * DELEGATES to `lib/rate-limit`, and the delegation is the point of this branch.
 *
 * Thirty call sites in twenty files already speak this signature - a composed
 * key string, a count, a window - and every one of them was hand-writing both
 * the prefix and the numbers. Rather than edit thirty files, this function now
 * routes through `rateLimitByKey`, so all thirty get the Upstash sliding window
 * with a Postgres fallback without a single one of them changing.
 *
 * The Redis key is built by `legacyRedisKey`, which produces the SAME string
 * `redisKey(name, identifier)` produces for the split form. That equality is
 * tested, and it is what makes moving a call site to `rateLimit('login', ip)` a
 * pure rename rather than a counter reset.
 *
 * Still returns a bare boolean, and still fails open, because both are what the
 * callers were written against. `rateLimit()` returns the counts and the reset
 * time for anything new.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 10,
  windowSeconds = 3600,
): Promise<boolean> {
  const decision = await rateLimitByKey(
    { redis: legacyRedisKey(key), postgres: key },
    maxAttempts,
    windowSeconds,
  )
  return decision.allowed
}

/**
 * The per-user limiter. It has NO CALLERS in this repo today, and it could not
 * have worked if it had any.
 *
 * MEASURED 2026-08-21: `check_user_rate_limit` is granted to `postgres` and
 * `service_role` only - not to `anon`, not to `authenticated`. On the
 * cookie-bound client it used to use, every call returned 42501, hit the
 * fail-open branch below, and returned `true`. Anyone wiring it up would have
 * got a limiter that logged an error once per request and enforced nothing.
 *
 * Moving it to the service-role client is what makes it real, so that it works
 * the first time somebody reaches for it rather than the second.
 */
export async function checkUserRateLimit(
  userId: string,
  action: string,
  maxAttempts = 100,
  windowSeconds = 3600,
): Promise<boolean> {
  const supabase = adminClientOrNull()
  if (!supabase) return true
  const { data, error } = await supabase.rpc(
    'check_user_rate_limit' as never,
    {
      p_user_id: userId,
      p_action: action,
      p_limit: maxAttempts,
      p_window_seconds: windowSeconds,
    } as never,
  )
  if (error) {
    // Fail open — don't block legitimate users if rate limit RPC is unavailable
    log.error('rate_limit.user_check_failed', { reason: error.message })
    return true
  }
  return data === true
}
