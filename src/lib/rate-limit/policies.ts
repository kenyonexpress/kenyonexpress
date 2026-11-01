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
 * 145, which is applied; the table does not reopen it, because Upstash is
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
  // C15: burst ceiling shared by every auth route, per IP. Sits beside the stricter
  // per-route limits below; it catches fast scripted traffic across routes.
  'auth-burst': { limit: 10, windowSeconds: 60, reason: 'C15: 10/min per IP across auth routes' },
  login: { limit: 5, windowSeconds: 900, reason: 'password guessing, per IP (F64: 5/15min)' },
  'login-account': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'password guessing on one account from rotating IPs',
  },
  signup: { limit: 3, windowSeconds: 3600, reason: 'account flooding, per IP (F64: 3/hour)' },
  magic: { limit: 5, windowSeconds: 3600, reason: 'magic-link mail sent to a real inbox' },
  'phone-otp': { limit: 5, windowSeconds: 3600, reason: 'OTP SMS costs money, per IP' },
  'phone-otp-number': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'OTP SMS to one number: the measured lockout vector',
  },
  'phone-verify': { limit: 20, windowSeconds: 3600, reason: 'OTP code guessing' },
  reset: { limit: 3, windowSeconds: 3600, reason: 'reset mail, per IP (F64: 3/hour)' },
  'reset-address': {
    limit: 3,
    windowSeconds: 3600,
    reason: 'reset mail to one address from rotating IPs (F64: 3/hour)',
  },
  'checkout-otp-send': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'checkout phone-verification SMS, per user',
  },
  'checkout-otp-send-ip': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'checkout phone-verification SMS, per IP',
  },
  'checkout-otp-verify': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'checkout phone-verification code guesses, per user',
  },
  'verify-card-stub': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'card-verification stub, per user; charges nothing, so looser than verify-card',
  },
  'verify-card': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'card-verification payment page creation, per user',
  },
  'email-verify': { limit: 20, windowSeconds: 3600, reason: 'mail OTP code guessing, per IP' },
  'email-verify-address': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'mail OTP code guessing, per address, so proxies cannot buy one account more tries',
  },
  'passkey-register': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'WebAuthn enrolment ceremonies; a real person adds one key, not eleven',
  },
  'mfa-enrol': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'TOTP factor creation, per user; one authenticator, not a pile of abandoned factors',
  },
  'mfa-verify': {
    limit: 10,
    windowSeconds: 900,
    reason: 'six digits are brute forceable; per-user bound is what actually protects the account',
  },
  'mfa-verify-ip': {
    limit: 30,
    windowSeconds: 900,
    reason: 'the same guesses spread across accounts from one address',
  },
  'passkey-login': {
    limit: 30,
    windowSeconds: 3600,
    reason: 'challenge issuance, per IP; cheap but each one sets a cookie',
  },
  'passkey-login-finish': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'assertion verification plus admin calls; one per real login',
  },
  'push-subscribe': {
    limit: 30,
    windowSeconds: 3600,
    reason:
      'service-role upserts to push_subscriptions; a browser re-posts one per page load at most',
  },
  'verify-card-callback': {
    limit: 60,
    windowSeconds: 3600,
    reason: 'card-verification return page, per IP; unauthenticated, so bounded before the lookup',
  },
  'offline-sync': { limit: 120, windowSeconds: 600, reason: 'offline queue replay, per IP' },
  'update-password': { limit: 10, windowSeconds: 3600, reason: 'session-bound password change' },
  'change-password': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'current-password re-proof from inside the account, keyed on the user id',
  },

  // -- Commerce. Higher, because a real shopper trips these by shopping.
  cart_write: { limit: 120, windowSeconds: 3600, reason: 'cart mutation, user or IP' },
  coupon_qr_apply: { limit: 30, windowSeconds: 3600, reason: 'printed QR landing, per IP' },
  gift_card_check: { limit: 20, windowSeconds: 3600, reason: 'gift card balance by code, per IP' },
  gift_card_redeem: {
    limit: 10,
    windowSeconds: 3600,
    reason: 'gift card redemption attempts, per user',
  },
  'supplier-apply': { limit: 5, windowSeconds: 3600, reason: 'supplier applications, per user' },
  'supplier-doc-upload': {
    limit: 30,
    windowSeconds: 3600,
    reason: 'presigned R2 PUT minting for onboarding documents, per user',
  },
  'voucher-transfer': { limit: 10, windowSeconds: 3600, reason: 'voucher transfers, per user' },
  coupon: { limit: 10, windowSeconds: 3600, reason: 'coupon code guessing' },
  begin_checkout: {
    limit: 10,
    windowSeconds: 3600,
    reason: 'Cardcom checkout creation (F64: 10/hour)',
  },

  // Added when this layer was rebased onto main: `referral-code` landed on main
  // after the table was first written, and the static audit below is what
  // caught it. Keyed on the user, not the IP, because the action can only touch
  // that user's own row - the limit bounds a held-down button, not an attacker.
  'referral-code': { limit: 10, windowSeconds: 3600, reason: 'referral code mint, per user' },
  'wishlist-toggle': { limit: 60, windowSeconds: 3600, reason: 'held-down heart, per user' },
  'wishlist-merge': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'guest list merge on sign-in, per user',
  },

  // Keyed on the user, never on IP, and deliberately generous rather than tight:
  // this is a STATUTORY notice under Consumer Protection Law 14ה, and a limit
  // that turns away a genuine cancellation is worse than one that lets a few
  // duplicates through. `refunds_one_open_per_order` already makes the duplicate
  // harmless; this only bounds a script.
  'refund-request': { limit: 5, windowSeconds: 3600, reason: 'cancellation notice, per user' },
  // The HTTP door in front of it: bounds an anonymous script before the session lookup.
  'refund-request-ip': { limit: 30, windowSeconds: 3600, reason: 'cancellation endpoint, per IP' },

  // rc5 F12. Keyed on the user: both act only on the caller's own affiliate row.
  'affiliate-join': { limit: 5, windowSeconds: 3600, reason: 'affiliate application, per user' },
  'affiliate-link': { limit: 30, windowSeconds: 3600, reason: 'affiliate link creation, per user' },
  // rc5 F15. Sign-in factors: per phone and per IP for sending, per phone for
  // guessing, per IP for passkey assertions.
  'wa-otp-send': {
    limit: 3,
    windowSeconds: 900,
    reason: 'WhatsApp code send, per phone (C90: 3/15min)',
  },
  'wa-otp-send-ip': { limit: 20, windowSeconds: 3600, reason: 'WhatsApp code send, per IP' },
  'wa-otp-verify': { limit: 10, windowSeconds: 3600, reason: 'WhatsApp code guesses, per phone' },
  'passkey-auth': { limit: 30, windowSeconds: 600, reason: 'passkey sign-in, per IP' },
  // rc5+ WhatsApp OTP (parallel to wa-otp-* for different auth flow)
  'whatsapp-otp': { limit: 5, windowSeconds: 3600, reason: 'WhatsApp OTP send, per IP' },
  'whatsapp-otp-number': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'WhatsApp OTP send to one number, per phone',
  },
  'whatsapp-verify': { limit: 20, windowSeconds: 3600, reason: 'WhatsApp OTP verify, per IP' },

  // -- Vouchers and the supplier till. Keyed on the supplier user, never on IP:
  // a shop floor is one NAT address and would share one bucket.
  redeem: { limit: 60, windowSeconds: 3600, reason: 'customer-facing redeem page, per IP' },
  'voucher-redeem': { limit: 120, windowSeconds: 3600, reason: 'till scans, per supplier user' },
  'voucher-redeem-code': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'redeem attempts against one short code, whoever scans it',
  },
  'voucher-redeem-batch': { limit: 40, windowSeconds: 3600, reason: 'batch scans, per supplier' },
  'voucher-lookup': { limit: 300, windowSeconds: 3600, reason: 'till lookups, per supplier' },
  'staff-pin': { limit: 15, windowSeconds: 3600, reason: 'PIN guessing on the till' },

  // -- Read paths. Large, because they are cheap and a human browsing hits them.
  search: { limit: 120, windowSeconds: 300, reason: 'search queries hit Meilisearch' },
  'search-suggest': { limit: 300, windowSeconds: 300, reason: 'typeahead fires per keystroke' },
  'search-facets': { limit: 60, windowSeconds: 300, reason: 'faceted search, filters + counts' },
  'catalogue-listing': {
    limit: 240,
    windowSeconds: 300,
    reason: 'listing pages appended by the infinite grid, one per scroll',
  },
  'search-click': { limit: 600, windowSeconds: 300, reason: 'search result clicks, per IP' },
  analytics: { limit: 120, windowSeconds: 60, reason: 'beacon endpoint, per IP' },

  // -- Public write forms. Five an hour, because these reach a human inbox.
  contact: { limit: 5, windowSeconds: 3600, reason: 'contact form mail (F64: 5/hour)' },
  'supplier-lead': { limit: 2, windowSeconds: 86400, reason: 'supplier lead mail (F64: 2/24h)' },
  newsletter: { limit: 5, windowSeconds: 3600, reason: 'newsletter subscription mail' },

  // -- Admin voucher tools. Keyed on the staff user; generous because a busy
  // support shift is legitimate traffic, bounded because both reach the
  // voucher tables with admin credentials.
  'admin-voucher-lookup': {
    limit: 60,
    windowSeconds: 3600,
    reason: 'admin voucher code lookup, per staff user',
  },
  'admin-voucher-redeem': {
    limit: 30,
    windowSeconds: 3600,
    reason: 'admin manual voucher burn, per staff user',
  },

  // -- Privacy self-service. Keyed on the user: both act only on the caller's
  // own account, so the limit bounds retries and stolen-session abuse.
  'account-delete': {
    limit: 3,
    windowSeconds: 3600,
    reason: 'destructive cascade over a dozen tables; a person needs exactly one',
  },
  'data-export': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'the export reads a dozen tables per call; a loop here is a cheap DB load',
  },

  // -- Mobile app surfaces (`apps/mobile` is a second caller of these routes).
  'app-session': { limit: 30, windowSeconds: 600, reason: 'app session exchange, per IP' },
  'push-register': { limit: 60, windowSeconds: 3600, reason: 'push token registration' },

  // -- Marketing and campaigns.
  'campaign-trigger': { limit: 5, windowSeconds: 3600, reason: 'campaign hook trigger, per user' },
  'sms-broadcast-create': {
    limit: 10,
    windowSeconds: 3600,
    reason: 'SMS broadcast creation, per admin',
  },
  'sms-broadcast-update': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'SMS broadcast updates, per admin',
  },
  'sms-unsubscribe': {
    limit: 5,
    windowSeconds: 3600,
    reason: 'SMS unsubscribe requests, per user',
  },
  // -- Machine-to-machine and operator mutations (G25). Webhooks are signed, so
  // these are ceilings against a flood of garbage that costs a signature check
  // and a database read, set well above any real provider's retry burst.
  'webhook-cardcom': { limit: 600, windowSeconds: 60, reason: 'Cardcom webhook flood, per IP' },
  'webhook-twilio': { limit: 300, windowSeconds: 60, reason: 'Twilio webhook flood, per IP' },
  'webhook-products': {
    limit: 300,
    windowSeconds: 60,
    reason: 'search sync webhook flood, per IP',
  },
  'search-index-job': { limit: 600, windowSeconds: 60, reason: 'QStash index job flood, per IP' },
  'search-index-dlq': { limit: 300, windowSeconds: 60, reason: 'QStash dead-letter flood, per IP' },
  'cache-purge': { limit: 30, windowSeconds: 60, reason: 'CDN purge hook, per IP' },
  'admin-product-import': { limit: 10, windowSeconds: 3600, reason: 'CSV import, per admin' },
  'phone-verify-complete': {
    limit: 20,
    windowSeconds: 3600,
    reason: 'phone milestone completion, per user',
  },
  'postal-lookup': {
    limit: 30,
    windowSeconds: 600,
    reason: 'postal-code lookups relayed to Israel Post, per IP',
  },
  'checkout-velocity-ip': {
    limit: 30,
    windowSeconds: 86400,
    reason: 'new orders from one address in a day; carding rotates cards, not addresses',
  },
  'checkout-velocity-email': {
    limit: 15,
    windowSeconds: 86400,
    reason: 'new orders on one email in a day; a stolen-card run batches on one login',
  },
  'checkout-velocity-phone': {
    limit: 15,
    windowSeconds: 86400,
    reason: 'new orders naming one delivery phone in a day, across accounts',
  },
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
