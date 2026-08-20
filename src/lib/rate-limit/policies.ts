/**
 * Every rate limit in this application, in one table.
 *
 * WHY A TABLE AND NOT THE LITERALS THAT WERE THERE. The numbers below were not
 * invented here: each row was read off the call site that owned it, and the
 * inventory test beside this file fails if a caller ever passes a pair that is
 * not in this table. That is the point of the file. Before it, `5, 3600`
 * appeared at eight call sites in three modules, `120, 3600` at four, and
 * nothing anywhere stated which of those were meant to be the same limit and
 * which merely collided. Asking "what protects the OTP path" meant grepping.
 *
 * THE KEY PREFIX IS PART OF THE POLICY, and that is a security property, not
 * bookkeeping. Two limits that share a prefix share a counter: if `login` and
 * `signup` both keyed on `auth:<ip>`, five signups would spend a real user's
 * login budget. The prefix is therefore derived from the policy name and never
 * passed in, so a new limit cannot silently land on top of an existing bucket.
 *
 * WHAT `identifier` MAY BE. An IP for the anonymous paths, a user id for the
 * authenticated ones, and for three rows a value the CALLER supplies (an email
 * address, an E.164 number). The third kind is why the limiter hashes nothing
 * and trusts nothing: `check_rate_limit` used to be reachable by anyone with
 * the publishable key, so `phone-otp-number:<victim>` five times locked that
 * person out of signing in. That hole is closed in `utils/rate-limit.ts` and by
 * `migrations/pending/127`; the table does not reopen it, because Upstash is
 * reachable only from the server.
 */

export type RateLimitPolicy = {
  /** Requests permitted inside one window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
  /** Prose, because a bare number does not say what breaks when it is wrong. */
  reason: string
}

export const RATE_LIMIT_POLICIES = {
  // -- Authentication. The smallest numbers in the table, because every one of
  // these paths either sends a message to a real person or guesses a secret.
  login: { limit: 10, windowSeconds: 3600, reason: 'password guessing, per IP' },
  'login-account': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'password guessing on one account from rotating IPs',
  },
  signup: { limit: 5, windowSeconds: 3600, reason: 'account flooding, per IP' },
  magic: { limit: 5, windowSeconds: 3600, reason: 'magic-link mail sent to a real inbox' },
  'phone-otp': { limit: 5, windowSeconds: 3600, reason: 'OTP SMS costs money, per IP' },
  'phone-otp-number': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'OTP SMS to one number: the measured lockout vector',
  },
  'phone-verify': { limit: 20, windowSeconds: 3600, reason: 'OTP code guessing' },
  reset: { limit: 5, windowSeconds: 3600, reason: 'reset mail, per IP' },
  'reset-address': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'reset mail to one address from rotating IPs',
  },
  'update-password': { limit: 10, windowSeconds: 3600, reason: 'session-bound password change' },

  // -- Commerce. Higher, because a real shopper trips these by shopping.
  cart_write: { limit: 120, windowSeconds: 3600, reason: 'cart mutation, user or IP' },
  coupon: { limit: 10, windowSeconds: 3600, reason: 'coupon code guessing' },
  begin_checkout: { limit: 10, windowSeconds: 60, reason: 'Cardcom low-profile creation' },

  // -- Vouchers and the supplier till. Keyed on the supplier user, never on IP:
  // a shop floor is one NAT address and would share one bucket.
  redeem: { limit: 60, windowSeconds: 3600, reason: 'customer-facing redeem page, per IP' },
  'voucher-redeem': { limit: 120, windowSeconds: 3600, reason: 'till scans, per supplier user' },
  'voucher-redeem-batch': { limit: 40, windowSeconds: 3600, reason: 'batch scans, per supplier' },
  'voucher-lookup': { limit: 300, windowSeconds: 3600, reason: 'till lookups, per supplier' },
  'staff-pin': { limit: 15, windowSeconds: 3600, reason: 'PIN guessing on the till' },

  // -- Read paths. Large, because they are cheap and a human browsing hits them.
  search: { limit: 120, windowSeconds: 300, reason: 'search queries hit Meilisearch' },
  'search-suggest': { limit: 300, windowSeconds: 300, reason: 'typeahead fires per keystroke' },
  analytics: { limit: 120, windowSeconds: 60, reason: 'beacon endpoint, per IP' },

  // -- Public write forms. Five an hour, because these reach a human inbox.
  contact: { limit: 5, windowSeconds: 3600, reason: 'contact form mail' },
  'supplier-lead': { limit: 5, windowSeconds: 3600, reason: 'supplier lead mail' },
  newsletter: { limit: 5, windowSeconds: 3600, reason: 'newsletter subscription mail' },

  // -- Mobile app surfaces (`apps/mobile` is a second caller of these routes).
  'app-session': { limit: 30, windowSeconds: 600, reason: 'app session exchange, per IP' },
  'push-register': { limit: 60, windowSeconds: 3600, reason: 'push token registration' },
} as const satisfies Record<string, RateLimitPolicy>

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES

export function policy(name: RateLimitPolicyName): RateLimitPolicy {
  return RATE_LIMIT_POLICIES[name]
}

/**
 * The Redis key. Namespaced with `rl:` so a future use of the same Upstash
 * database for anything else cannot collide with a counter, and versioned with
 * `v1` so changing the ALGORITHM (which changes the value type stored at the
 * key: a sorted set today, a counter under a fixed window) does not have to
 * migrate or delete live keys — it just stops reading the old ones, and they
 * expire on their own TTL.
 */
export function redisKey(name: string, identifier: string): string {
  return `rl:v1:${name}:${identifier}`
}

/**
 * The Postgres key, which is NOT the Redis key.
 *
 * These strings are already in the `rate_limits` table in production, written
 * by the call sites this layer took over, and the fallback path has to keep
 * counting in the same buckets or a failover to Postgres would hand every
 * caller a fresh empty allowance at exactly the moment the primary is down.
 * `cart_write` is the one row whose live keys carry a second segment
 * (`cart_write:user:<uuid>` / `cart_write:ip:<ip>`), which the caller passes in
 * the identifier, so no special case is needed here.
 */
export function postgresKey(name: string, identifier: string): string {
  return `${name}:${identifier}`
}

/**
 * The same Redis key, built from the pre-composed `"<name>:<identifier>"`
 * string the thirty existing call sites pass to `checkRateLimit`.
 *
 * THIS MUST AGREE WITH `redisKey` CHARACTER FOR CHARACTER, and there is a test
 * that walks the whole policy table asserting it does. If the two drifted, then
 * migrating any call site from `checkRateLimit('login:' + ip, 10, 3600)` to
 * `rateLimit('login', ip)` would move it to a DIFFERENT bucket and hand every
 * caller a fresh empty allowance at the moment of the edit — a rate limit that
 * resets itself on refactor, which is the kind of hole that gets found in
 * production by whoever is abusing it.
 */
export function legacyRedisKey(compositeKey: string): string {
  return `rl:v1:${compositeKey}`
}
