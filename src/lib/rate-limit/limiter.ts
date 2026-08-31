import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type RateLimitPolicyName, policy as policyFor, postgresKey, redisKey } from './policies'
import { evaluateWindow } from './sliding-window'
import { type UpstashConfig, upstashConfig } from './upstash'

/**
 * The one decision every limit in this app goes through.
 *
 * THREE BACKENDS, TRIED IN THIS ORDER, AND THE ORDER IS THE DESIGN.
 *
 *   upstash  — the real limiter. Exact, atomic, one round trip.
 *   postgres — `check_rate_limit`, the limiter this app shipped with. Still
 *              counting in the same `rate_limits` rows, so a failover does not
 *              hand everyone a fresh allowance.
 *   open     — allow, and say so loudly.
 *
 * WHY FAIL OPEN AT ALL. It is a real choice with a real cost, and it is
 * inherited rather than invented: both Postgres limiters already returned
 * `true` on any error. Failing CLOSED would mean an Upstash outage logs every
 * customer out of checkout, and a limiter is a defence against abuse, not a
 * component the shop should die with. The cost is that an outage is also an
 * open door, which is why `backend: 'open'` is logged at error level on every
 * single request rather than sampled — `checkRateLimiter` in the health report
 * exists to catch exactly this state, and a quiet one is the failure mode.
 *
 * WHY POSTGRES STAYS IN THE CHAIN instead of being deleted with the migration.
 * `UPSTASH_REDIS_REST_URL` is not set in any environment this repo can see
 * today. If this layer required it, merging this branch would turn every limit
 * in the app off until somebody provisions a database — the change would look
 * like a security improvement and land as a regression. With the chain, an
 * unconfigured deployment behaves exactly as it does now, and provisioning
 * Upstash is a pure upgrade with no code change.
 */
export type RateLimitBackend = 'upstash' | 'postgres' | 'open'

export type RateLimitDecision = {
  allowed: boolean
  limit: number
  windowSeconds: number
  /**
   * Nullable, and not for convenience. The Postgres RPC returns one boolean and
   * no counter, so on that path the number is genuinely unknown. Reporting a
   * plausible-looking `limit - 1` would put a fabricated figure in a
   * `RateLimit-Remaining` header that clients pace themselves against.
   */
  remaining: number | null
  resetAtMs: number | null
  backend: RateLimitBackend
}

export type RateLimitOptions = {
  /** Injected only by tests and by callers that already have a timestamp. */
  nowMs?: number
  /** Overrides the table. For the analytics beacon, which reads its own const. */
  limit?: number
  windowSeconds?: number
}

/**
 * Sorted-set members must be unique or a second request inside the same
 * millisecond would overwrite the first's score instead of adding to the count,
 * silently granting a free request per millisecond per key. The timestamp is
 * the SCORE; the member only has to be distinct.
 */
function uniqueMember(): string {
  return crypto.randomUUID()
}

async function viaUpstash(
  config: UpstashConfig,
  args: { key: string; limit: number; windowSeconds: number; nowMs: number },
): Promise<RateLimitDecision | null> {
  const windowMs = args.windowSeconds * 1000
  let state: Awaited<ReturnType<typeof evaluateWindow>>
  try {
    state = await evaluateWindow(config, {
      key: args.key,
      nowMs: args.nowMs,
      windowMs,
      limit: args.limit,
      member: uniqueMember(),
    })
  } catch (error) {
    log.warn('rate_limit.upstash_failed', {
      key: args.key,
      reason: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  if (!state) {
    log.warn('rate_limit.upstash_unreadable', { key: args.key })
    return null
  }

  return {
    allowed: state.allowed,
    limit: args.limit,
    windowSeconds: args.windowSeconds,
    remaining: Math.max(0, args.limit - state.used),
    resetAtMs: state.resetAtMs,
    backend: 'upstash',
  }
}

/**
 * The inherited limiter, unchanged in behaviour and unchanged in which role it
 * runs as. `createAdminClient()` is the whole security property here: while
 * these RPCs ran on the cookie-bound client they needed an `anon` EXECUTE
 * grant, and the publishable key is public, so anyone could spend anyone's
 * budget by naming their key. See `utils/rate-limit.ts` for the measurement and
 * `migrations/pending/145` for the revoke.
 */
async function viaPostgres(args: {
  key: string
  limit: number
  windowSeconds: number
}): Promise<RateLimitDecision | null> {
  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (error) {
    log.error('rate_limit.admin_client_unavailable', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  const { data, error } = await supabase.rpc(
    'check_rate_limit' as never,
    {
      p_key: args.key,
      p_max_attempts: args.limit,
      p_window_seconds: args.windowSeconds,
    } as never,
  )

  if (error) {
    log.error('rate_limit.check_failed', { key: args.key, reason: error.message })
    return null
  }

  return {
    allowed: data === true,
    limit: args.limit,
    windowSeconds: args.windowSeconds,
    remaining: null,
    resetAtMs: null,
    backend: 'postgres',
  }
}

/**
 * The compat entry point: an arbitrary key and explicit numbers, which is the
 * shape all thirty existing call sites already speak. `rateLimit()` below is
 * the shape new code should use.
 */
export async function rateLimitByKey(
  keys: { redis: string; postgres: string },
  limit: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<RateLimitDecision> {
  const nowMs = options.nowMs ?? Date.now()

  const config = upstashConfig()
  if (config) {
    const decision = await viaUpstash(config, { key: keys.redis, limit, windowSeconds, nowMs })
    if (decision) return decision
  }

  const fallback = await viaPostgres({ key: keys.postgres, limit, windowSeconds })
  if (fallback) return fallback

  // Both backends are gone. The request proceeds, and the line below is the
  // only trace that it was unmetered.
  log.error('rate_limit.open', { key: keys.postgres, limit, windowSeconds })
  return {
    allowed: true,
    limit,
    windowSeconds,
    remaining: null,
    resetAtMs: null,
    backend: 'open',
  }
}

/**
 * The API new call sites should use: name a policy, hand over the identifier,
 * and never write a number or a key prefix by hand.
 */
export async function rateLimit(
  name: RateLimitPolicyName,
  identifier: string,
  options: RateLimitOptions = {},
): Promise<RateLimitDecision> {
  const configured = policyFor(name)
  const limit = options.limit ?? configured.limit
  const windowSeconds = options.windowSeconds ?? configured.windowSeconds
  return rateLimitByKey(
    { redis: redisKey(name, identifier), postgres: postgresKey(name, identifier) },
    limit,
    windowSeconds,
    options,
  )
}
