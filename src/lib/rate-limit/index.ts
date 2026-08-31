/**
 * The rate limiting layer.
 *
 * `rateLimit('phone-otp-number', e164)` is the whole public surface for new
 * code: the policy table owns the numbers and the key prefix, the limiter owns
 * the backend chain (Upstash, then Postgres, then open-and-loud), and
 * `rateLimitHeaders` / `tooManyRequests` own what a refused caller is told.
 *
 * `lib/utils/rate-limit.ts` keeps the older boolean-returning `checkRateLimit`
 * for the thirty call sites that already speak it. It routes through here, so
 * those call sites get Upstash without being edited.
 */
export {
  type RateLimitBackend,
  type RateLimitDecision,
  type RateLimitOptions,
  rateLimit,
  rateLimitByKey,
} from './limiter'
export { rateLimitHeaders, tooManyRequests } from './headers'
export {
  type RateLimitPolicy,
  type RateLimitPolicyName,
  RATE_LIMIT_POLICIES,
  policy,
  postgresKey,
  redisKey,
} from './policies'
export { isUpstashConfigured } from './upstash'
