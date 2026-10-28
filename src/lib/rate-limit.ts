/**
 * Upstash rate limiter wrapper - F64
 *
 * Three-tier fallback system:
 * 1. Upstash Redis (primary) - fast, atomic, distributed
 * 2. Postgres (fallback) - check_rate_limit function
 * 3. Fail open (last resort) - log error and allow request
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type RateLimitPolicyName,
  policy as policyFor,
  postgresKey,
  redisKey,
} from './rate-limit/policies'
import { evaluateWindow } from './rate-limit/sliding-window'
import { type UpstashConfig, upstashConfig } from './rate-limit/upstash'

export type RateLimitBackend = 'upstash' | 'postgres' | 'open'

export type RateLimitDecision = {
  allowed: boolean
  limit: number
  windowSeconds: number
  remaining: number | null
  resetAtMs: number | null
  backend: RateLimitBackend
}

export type RateLimitOptions = {
  nowMs?: number
  limit?: number
  windowSeconds?: number
}

function uniqueMember(): string {
  return crypto.randomUUID()
}

async function viaUpstash(
  config: UpstashConfig,
  args: { key: string; limit: number; windowSeconds: number; nowMs: number },
): Promise<RateLimitDecision | null> {
  const windowMs = args.windowSeconds * 1000
  try {
    const state = await evaluateWindow(config, {
      key: args.key,
      nowMs: args.nowMs,
      windowMs,
      limit: args.limit,
      member: uniqueMember(),
    })

    if (!state) return null

    return {
      allowed: state.allowed,
      limit: args.limit,
      windowSeconds: args.windowSeconds,
      remaining: Math.max(0, args.limit - state.used),
      resetAtMs: state.resetAtMs,
      backend: 'upstash',
    }
  } catch (err) {
    log.error('rate_limit.upstash_failed', {
      key: args.key,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function viaPostgres(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitDecision | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('check_rate_limit', {
      check_key: key,
      check_limit: limit,
      check_window_seconds: windowSeconds,
    })

    if (error) throw error

    return {
      allowed: data === true,
      limit,
      windowSeconds,
      remaining: null,
      resetAtMs: null,
      backend: 'postgres',
    }
  } catch (err) {
    log.error('rate_limit.postgres_failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Main rate limiting function - tries Upstash, falls back to Postgres, fails open
 */
export async function rateLimit(
  policyName: RateLimitPolicyName,
  identifier: string,
  opts: RateLimitOptions = {},
): Promise<RateLimitDecision> {
  const policy = policyFor(policyName)
  const limit = opts.limit ?? policy.limit
  const windowSeconds = opts.windowSeconds ?? policy.windowSeconds
  const nowMs = opts.nowMs ?? Date.now()

  // Try Upstash first
  const config = upstashConfig()
  if (config) {
    const key = redisKey(policyName, identifier)
    const decision = await viaUpstash(config, { key, limit, windowSeconds, nowMs })
    if (decision) return decision
  }

  // Fallback to Postgres
  const pgKey = postgresKey(policyName, identifier)
  const decision = await viaPostgres(pgKey, limit, windowSeconds)
  if (decision) return decision

  // Fail open with error log
  log.error('rate_limit.all_backends_failed', {
    policy: policyName,
    identifier,
    message: 'Both Upstash and Postgres failed, allowing request',
  })

  return {
    allowed: true,
    limit,
    windowSeconds,
    remaining: null,
    resetAtMs: null,
    backend: 'open',
  }
}

export async function rateLimitByKey(
  key: string,
  limit: number,
  windowSeconds: number,
  opts: RateLimitOptions = {},
): Promise<RateLimitDecision> {
  const nowMs = opts.nowMs ?? Date.now()

  const config = upstashConfig()
  if (config) {
    const decision = await viaUpstash(config, { key, limit, windowSeconds, nowMs })
    if (decision) return decision
  }

  const decision = await viaPostgres(key, limit, windowSeconds)
  if (decision) return decision

  return {
    allowed: true,
    limit,
    windowSeconds,
    remaining: null,
    resetAtMs: null,
    backend: 'open',
  }
}

export { getClientIp, checkRateLimit } from './utils/rate-limit'
export {
  policy,
  redisKey,
  postgresKey,
  legacyRedisKey,
  RATE_LIMIT_POLICIES,
  type RateLimitPolicy,
  type RateLimitPolicyName,
} from './rate-limit/policies'
