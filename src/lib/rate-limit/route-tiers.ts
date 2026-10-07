import { log } from '@/lib/observability/log'
import type { RateLimitDecision } from './limiter'
import { type BucketShape, evaluateBucket } from './token-bucket'
import { upstashConfig } from './upstash'

/**
 * Per-route ceilings as a RATE, keyed on the address and the user together.
 *
 * WHAT THE TWO LAYERS UNDERNEATH DO NOT COVER. The graduated shield
 * (`graduated.ts`) meters the whole of `/api/*` per address and knows nothing
 * about who is signed in; the policy table (`policies.ts`) meters one action
 * inside one handler and is keyed on whichever single identifier that handler
 * chose. Neither answers "this address, as this user, on this route": a shared
 * office address signs five people in and the sixth is refused on `login`'s
 * per-IP row, while one account hopping addresses never meets a per-IP row at
 * all. The key here is both halves, so an office is five buckets and an
 * account on five addresses is five buckets, each at the route's own rate.
 *
 * THE NUMBERS ARE THE BRIEF'S (STEP 29): auth 5 a minute, search 30 a minute,
 * checkout 3 a minute. Capacity equals the per-minute figure, so the largest
 * burst a caller is ever handed is one minute's worth, and after that the
 * bucket refills one token every `period / refill` milliseconds: twelve
 * seconds on auth, two on search, twenty on checkout. `Retry-After` says
 * exactly that interval, not "wait for the window".
 *
 * WHICH REQUESTS. Server actions POST to the page they were rendered on, so
 * the auth tier is a POST to an auth page and the checkout tier is a POST to
 * `/checkout`; a GET of the login form is not an attempt and is free. The
 * search tier is the two query routes that do work per request. The
 * typeahead (`/api/search/suggest`) is deliberately not in it: it fires per
 * keystroke behind its own 300 / 5 min row, and thirty a minute would refuse
 * a shopper typing a two-word query. Everything the edge shield already
 * routes around (cron, webhooks, QStash) is unmatched here as well.
 *
 * UPSTASH ONLY, LIKE THE SHIELD. This runs in the proxy on every matched
 * request; the Postgres fallback is right for a route that fires once per
 * checkout and wrong for an edge check. Unconfigured or down, the decision is
 * open and logged at error level, and the per-handler rows keep holding.
 *
 * WHERE IT SITS. After the session refresh in `proxy.ts`, because the user id
 * is half the key and the refresh is what produces it; before route
 * protection, so a refused request is answered before any page work.
 */
export type RouteTier = BucketShape & {
  /** Prose, because a bare number does not say what breaks when it is wrong. */
  reason: string
}

const MINUTE_MS = 60_000

export const ROUTE_TIERS = {
  auth: {
    capacity: 5,
    refillTokens: 5,
    refillPeriodMs: MINUTE_MS,
    reason: 'sign-in, sign-up, reset and MFA submissions; a person needs one, a guesser needs many',
  },
  search: {
    capacity: 30,
    refillTokens: 30,
    refillPeriodMs: MINUTE_MS,
    reason:
      'query and facet routes do real work per call; a browsing person stays under one every two seconds',
  },
  checkout: {
    capacity: 3,
    refillTokens: 3,
    refillPeriodMs: MINUTE_MS,
    reason:
      'the pay press creates a Cardcom low profile; three in a minute is a retry, not a shopper',
  },
} as const satisfies Record<string, RouteTier>

export type RouteTierName = keyof typeof ROUTE_TIERS

export function routeTier(name: RouteTierName): RouteTier {
  return ROUTE_TIERS[name]
}

/** Auth pages whose server actions are the sign-in surface. Exact paths. */
const AUTH_POST_PATHS: ReadonlySet<string> = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/supplier/login',
])

/** The checkout page itself: `submitCheckout` posts here. Sub-routes are reads. */
const CHECKOUT_POST_PATHS: ReadonlySet<string> = new Set(['/checkout'])

/** The query routes. Not `suggest` (typeahead) and not `quick-links` (cached list). */
const SEARCH_PATHS: ReadonlySet<string> = new Set(['/api/search', '/api/search/facets'])

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/**
 * Which tier a request falls under, or null when it is not metered here.
 * Pure, so the routing table has a test that does not build a NextRequest.
 */
export function routeTierFor(method: string, pathname: string): RouteTierName | null {
  const path = withoutTrailingSlash(pathname)
  if (SEARCH_PATHS.has(path)) return 'search'
  if (method.toUpperCase() !== 'POST') return null
  if (AUTH_POST_PATHS.has(path)) return 'auth'
  if (CHECKOUT_POST_PATHS.has(path)) return 'checkout'
  return null
}

/**
 * The bucket's identity: the address and the user, both when both are known.
 *
 * Null when neither is known, and the caller stands aside: with no address
 * (a direct local request) and no session there is nothing to key on, and an
 * `unknown` bucket would put every such caller in one.
 */
export function routeTierIdentity(address: string | null, userId: string | null): string | null {
  const parts: string[] = []
  if (address) parts.push(`ip:${address}`)
  if (userId) parts.push(`u:${userId}`)
  return parts.length > 0 ? parts.join('|') : null
}

/** `rl:v1:tb:` so a bucket can never land on a policy row or a shield window. */
export function routeTierKey(name: RouteTierName, identity: string): string {
  return `rl:v1:tb:${name}:${identity}`
}

export type RouteTierDecision = {
  allowed: boolean
  tier: RouteTierName
  /** Seconds until one more token lands. Null when allowed. */
  retryAfterSeconds: number | null
  /** The shape `rateLimitHeaders` renders: limit is the capacity, reset is the retry. */
  decision: RateLimitDecision
  backend: 'upstash' | 'open'
}

export type RouteTierOptions = {
  nowMs?: number
  env?: NodeJS.ProcessEnv
}

function openDecision(name: RouteTierName): RouteTierDecision {
  const shape = routeTier(name)
  return {
    allowed: true,
    tier: name,
    retryAfterSeconds: null,
    decision: {
      allowed: true,
      limit: shape.capacity,
      windowSeconds: shape.refillPeriodMs / 1000,
      remaining: null,
      resetAtMs: null,
      backend: 'open',
    },
    backend: 'open',
  }
}

/**
 * The decision: one script, one round trip. A refusal carries the exact wait
 * for the next token, which `tooManyRequests` renders as `Retry-After` and
 * `RateLimit-Reset`. An allowed answer carries the tokens left and the time
 * to full, so a well-behaved client (`apps/mobile`) can pace itself.
 */
export async function routeTierRateLimit(
  name: RouteTierName,
  identity: string,
  options: RouteTierOptions = {},
): Promise<RouteTierDecision> {
  const config = upstashConfig(options.env ?? process.env)
  if (!config) return openDecision(name)

  const shape = routeTier(name)
  const nowMs = options.nowMs ?? Date.now()

  try {
    const state = await evaluateBucket(config, {
      key: routeTierKey(name, identity),
      nowMs,
      shape,
    })
    if (!state) throw new Error('unreadable bucket state')

    const retryAfterSeconds = state.allowed
      ? null
      : Math.max(1, Math.ceil(state.retryAfterMs / 1000))
    if (!state.allowed) {
      log.warn('rate_limit.route_tier_refused', { tier: name, retryAfterSeconds })
    }

    return {
      allowed: state.allowed,
      tier: name,
      retryAfterSeconds,
      decision: {
        allowed: state.allowed,
        limit: shape.capacity,
        windowSeconds: shape.refillPeriodMs / 1000,
        remaining: state.tokens,
        resetAtMs: nowMs + (state.allowed ? state.fullInMs : (retryAfterSeconds as number) * 1000),
        backend: 'upstash',
      },
      backend: 'upstash',
    }
  } catch (error) {
    // Same policy as the shield and the flat limiter, for the same reason: an
    // Upstash outage must not take the shop with it. Loud, not sampled.
    log.error('rate_limit.route_tier_open', {
      tier: name,
      reason: error instanceof Error ? error.message : String(error),
    })
    return openDecision(name)
  }
}
