/**
 * Rate limiting API
 *
 * Three-tier system: Upstash Redis → Postgres → Fail open
 *
 * Usage:
 *   import { rateLimit } from '@/lib/rate-limit'
 *
 *   const decision = await rateLimit('login', ip)
 *   if (!decision.allowed) {
 *     return { error: 'Too many attempts' }
 *   }
 *
 * Policies defined in ./rate-limit/policies.ts
 * Implementation in ./rate-limit/limiter.ts
 */

export {
  rateLimit,
  rateLimitByKey,
  type RateLimitBackend,
  type RateLimitDecision,
  type RateLimitOptions,
} from './rate-limit/limiter'

export {
  policy,
  redisKey,
  postgresKey,
  legacyRedisKey,
  RATE_LIMIT_POLICIES,
  type RateLimitPolicy,
  type RateLimitPolicyName,
} from './rate-limit/policies'

export { getClientIp, checkRateLimit, checkUserRateLimit } from './utils/rate-limit'
