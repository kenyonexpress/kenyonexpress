import { log } from '@/lib/observability/log'
import { isPaymentFramePath } from '@/lib/security/frame-policy'

/**
 * Per-IP request limiting at the edge, before the session refresh.
 *
 * WHY HERE AND NOT NEXT TO THE EXISTING ONE. `@/lib/utils/rate-limit` counts in
 * Postgres through `check_rate_limit()`, which means a round trip to the
 * database and a row written per attempt. That is the right shape for the
 * server actions that already use it -- they are about to talk to the database
 * anyway -- and the wrong shape for a flood: the point of limiting a login
 * endpoint is that the ten thousandth attempt costs us nothing, and a Postgres
 * write per attempt is the opposite of that. This one runs in `src/proxy.ts`
 * ahead of `supabase.auth.getUser()`, so a refused request costs one Redis
 * round trip and never touches the auth server or the database. The two are not
 * redundant: this is the outer wall, keyed by IP; the inner ones are keyed by
 * user, phone number and account, which an IP limit cannot express.
 *
 * WHY NO `@upstash/ratelimit` PACKAGE. Upstash Redis is an HTTP API and the
 * whole algorithm below is two commands in one pipeline call. The dependency
 * would buy retry policy and an analytics blob we do not read, and it would
 * have to be installed into a worktree whose `node_modules` is a symlink to the
 * main checkout -- `pnpm add` there empties the checkout every other agent is
 * building against. `fetch` is already in both runtimes.
 *
 * FIXED WINDOW, NOT SLIDING. A sliding log costs a sorted set and a member per
 * request; a fixed window costs one INCR. The known cost is that a caller can
 * spend the whole allowance at the end of one window and again at the start of
 * the next, so 10/min tolerates 20 in a two-second seam. Against credential
 * stuffing, where the number that matters is attempts per hour, that seam does
 * not change the answer.
 */

export type RateLimitRule = {
  /** Matched with `startsWith`, so `/api/auth` covers `/api/auth/anything`. */
  prefix: string
  /** When set, only these methods count. Absent means every method. */
  methods?: readonly string[]
  limit: number
  windowSeconds: number
}

/**
 * THE TWO RULES THIS WAVE WAS ASKED FOR, plus the paths they describe.
 *
 * `/api/auth` and `/api/checkout` have no route in this repo today -- measured,
 * not assumed: `find src/app/api -name route.ts` lists neither, authentication
 * is server actions in `src/server/actions/auth.ts` reached by POST to the
 * `(auth)` pages, and checkout is a server action on `/checkout`. Writing only
 * the two named prefixes would have shipped a limiter that limits nothing, and
 * dropping them would have left the next `/api/auth/...` route unguarded on the
 * day it lands. Both are here.
 *
 * The page rules are POST-only. A GET of `/login` is someone looking at a form,
 * and eleven of those in a minute is a person with a flaky connection, not an
 * attack.
 */
export const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { prefix: '/api/auth', limit: 10, windowSeconds: 60 },
  { prefix: '/api/checkout', limit: 5, windowSeconds: 60 },
  { prefix: '/login', methods: ['POST'], limit: 10, windowSeconds: 60 },
  { prefix: '/signup', methods: ['POST'], limit: 10, windowSeconds: 60 },
  { prefix: '/forgot-password', methods: ['POST'], limit: 10, windowSeconds: 60 },
  { prefix: '/reset-password', methods: ['POST'], limit: 10, windowSeconds: 60 },
  { prefix: '/checkout', methods: ['POST'], limit: 5, windowSeconds: 60 },
]

/**
 * The first matching rule wins, so order the table longest-prefix first where
 * two could overlap. `/api/checkout` is listed above `/checkout` for exactly
 * that reason, though neither is a prefix of the other today.
 */
export function ruleFor(
  pathname: string,
  method: string,
  rules: readonly RateLimitRule[] = RATE_LIMIT_RULES,
): RateLimitRule | null {
  // The one path under /checkout that Cardcom navigates to, and the one that
  // must never be counted. It is a CROSS-SITE navigation into our iframe, so
  // the address on it is whatever network the shopper is on -- an office, a
  // mall's public wifi, a carrier NAT. Five paying customers behind one
  // address in a minute is a normal Saturday, and the sixth would be shown a
  // 429 instead of the payment they have already been charged for.
  if (isPaymentFramePath(pathname)) return null

  for (const rule of rules) {
    if (!pathname.startsWith(rule.prefix)) continue
    if (rule.methods && !rule.methods.includes(method.toUpperCase())) continue
    return rule
  }
  return null
}

/**
 * The client's address, taken from the first hop of `x-forwarded-for`.
 *
 * The LAST hop is the proxy that added the header, and the middle ones are
 * whatever the client sent -- a caller can prepend as many fake addresses as
 * they like. On Vercel the first entry is the one Vercel itself wrote, which is
 * why it is the one read here.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || headers.get('x-real-ip') || 'unknown'
}

export type RateLimitVerdict = {
  allowed: boolean
  /** Requests used in this window, counting the current one. */
  count: number
  limit: number
  /** Seconds until the window rolls, for `Retry-After`. */
  resetSeconds: number
}

type UpstashConfig = { url: string; token: string }

function upstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/**
 * In-memory fallback, for local development and tests.
 *
 * IT IS NOT A RATE LIMIT IN PRODUCTION and must never be mistaken for one: a
 * serverless deployment is many instances, each with its own Map, so the real
 * ceiling is the limit times the instance count and an instance that scales
 * down forgets everything it counted. It exists so a developer without Upstash
 * credentials sees the 429 path work. `upstashConfigured()` below is what a
 * boot check should assert in production.
 */
const memory = new Map<string, { count: number; resetAt: number }>()

/**
 * Reported once per process, not per request: in production the fallback means
 * there is effectively no limit, and that must not be silent. Not a boot
 * failure -- `src/lib/env.ts` deliberately leaves these two out of the required
 * list, because refusing to serve the shop over a limiter that fails open
 * anyway trades a small risk for a certain outage.
 */
let fallbackReported = false

export function upstashConfigured(): boolean {
  return upstashConfig() !== null
}

function countInMemory(key: string, rule: RateLimitRule, now: number): RateLimitVerdict {
  if (!fallbackReported && process.env.NODE_ENV === 'production') {
    fallbackReported = true
    log.warn('rate_limit.upstash_absent', {
      reason: 'UPSTASH_REDIS_REST_URL/TOKEN unset; per-instance memory is not a rate limit',
    })
  }

  const existing = memory.get(key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + rule.windowSeconds * 1000
    memory.set(key, { count: 1, resetAt })
    // Bound the map: without this a long-lived dev server accumulates one entry
    // per IP per window forever.
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k)
    }
    return { allowed: true, count: 1, limit: rule.limit, resetSeconds: rule.windowSeconds }
  }
  existing.count += 1
  return {
    allowed: existing.count <= rule.limit,
    count: existing.count,
    limit: rule.limit,
    resetSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/**
 * INCR the counter and, only if it was just created, give it the window as a
 * TTL. `NX` on the PEXPIRE is what makes it a fixed window rather than a
 * rolling one: without it every request would push the expiry out and a steady
 * stream of traffic would keep one window open forever.
 *
 * The two commands go in one pipeline call because two round trips would let a
 * crash between them leave a counter with no TTL, which is a key that blocks an
 * address permanently.
 */
async function countInUpstash(
  key: string,
  rule: RateLimitRule,
  config: UpstashConfig,
): Promise<RateLimitVerdict | null> {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['PEXPIRE', key, String(rule.windowSeconds * 1000), 'NX'],
    ]),
    // A rate limiter that hangs is worse than one that is absent: it would add
    // its own latency to every request it was meant to protect.
    signal: AbortSignal.timeout(1_000),
  })

  if (!response.ok) return null
  const body = (await response.json()) as { result?: unknown; error?: string }[]
  const count = body[0]?.result
  if (typeof count !== 'number') return null

  return {
    allowed: count <= rule.limit,
    count,
    limit: rule.limit,
    resetSeconds: rule.windowSeconds,
  }
}

/**
 * FAILS OPEN, deliberately and in agreement with `checkRateLimit`.
 *
 * An Upstash outage must not be an outage of the login page. The exposure is
 * bounded: the inner Postgres limits on the server actions are a separate
 * system with a separate failure mode, so losing this one does not leave the
 * auth path uncounted, and the loss is logged rather than swallowed.
 */
export async function consumeRateLimit(
  pathname: string,
  method: string,
  headers: Headers,
  now: number = Date.now(),
): Promise<RateLimitVerdict | null> {
  const rule = ruleFor(pathname, method)
  if (!rule) return null

  const key = `rl:${rule.prefix}:${clientIp(headers)}`
  const config = upstashConfig()
  if (!config) return countInMemory(key, rule, now)

  try {
    const verdict = await countInUpstash(key, rule, config)
    if (verdict) return verdict
    log.warn('rate_limit.upstash_unusable', { path: rule.prefix })
  } catch (error) {
    log.warn('rate_limit.upstash_failed', {
      path: rule.prefix,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
  return null
}

/** Exported for tests: the fallback keeps state across calls by design. */
export const __test = { memory, countInMemory }
