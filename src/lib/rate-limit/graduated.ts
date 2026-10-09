import { log } from '@/lib/observability/log'
import type { RateLimitDecision } from './limiter'
import { evaluateWindow } from './sliding-window'
import { type UpstashConfig, command, upstashConfig } from './upstash'

/**
 * Graduated rate limiting: several windows per caller, and a cooldown that
 * grows with every refusal.
 *
 * WHAT THE FLAT TABLE CANNOT SAY. `RATE_LIMIT_POLICIES` gives every route one
 * number over one window, and that is the right shape for "five OTPs an
 * hour". It is the wrong shape for the public API as a whole: 300 requests in
 * five minutes is a person browsing, and 300 requests in five SECONDS is a
 * scraper, yet a single `300 / 300s` row admits both. A burst tier and a
 * sustained tier over the same key tell the two apart: the scraper hits the
 * burst ceiling in its first second, the shopper never does.
 *
 * WHY REFUSALS ESCALATE. A caller at the ceiling who keeps retrying costs one
 * Upstash round trip per attempt forever, and a flat limiter never gets
 * cheaper. Here a refusal writes a strike, the strikes pick a cooldown that
 * doubles each time (bounded), and while the cooldown runs every request is
 * answered from one `PTTL` without touching the windows. A shopper who trips
 * the burst tier once pays a few seconds; a loop that trips it fifty times
 * pays the cap.
 *
 * WHERE IT SITS IN THE CHAIN. This layer is the edge shield in front of
 * `/api/*`, keyed on the client address, and it runs BEFORE the session
 * refresh in `proxy.ts` so a refused request costs no Supabase call. The
 * per-route table in `policies.ts` stays underneath it as the floor: a route
 * keeps its own ceiling whether or not this layer is on.
 *
 * UPSTASH ONLY, BY DESIGN. The flat limiter falls back to a Postgres RPC, and
 * that is correct for a route that fires once per checkout. It would be wrong
 * here: this runs on every API request, and a Postgres round trip on each of
 * them under a Redis outage is a second outage. Unconfigured or unreachable,
 * the decision is `allowed` with `backend: 'open'`, the per-route floor keeps
 * holding, and `checkRateLimiter` in the health report shows the state.
 */

export type GraduatedTier = {
  /** Named so the 429 body and the log line can say which window refused. */
  label: 'burst' | 'sustained' | 'daily'
  limit: number
  windowSeconds: number
}

export type PenaltyPolicy = {
  /** Cooldown after the first refusal. */
  baseSeconds: number
  /** Each further refusal inside `strikeTtlSeconds` multiplies the cooldown. */
  multiplier: number
  /** The cooldown never exceeds this, so a mistaken block always ends. */
  maxSeconds: number
  /** How long a strike is remembered; an old strike stops escalating. */
  strikeTtlSeconds: number
}

export type GraduatedPolicy = {
  tiers: readonly GraduatedTier[]
  penalty: PenaltyPolicy
  reason: string
}

export const GRADUATED_POLICIES = {
  /**
   * The public API, per client address, with no session. The burst tier is
   * what a browser opening a product page fires (a handful of fetches inside
   * a second); the sustained tier is a person clicking for five minutes; the
   * daily tier is what no person does.
   */
  'api-anon': {
    tiers: [
      { label: 'burst', limit: 30, windowSeconds: 10 },
      { label: 'sustained', limit: 300, windowSeconds: 300 },
      { label: 'daily', limit: 5000, windowSeconds: 86400 },
    ],
    penalty: { baseSeconds: 10, multiplier: 2, maxSeconds: 900, strikeTtlSeconds: 3600 },
    reason: 'the whole of /api from one address; scrapers trip burst, people never do',
  },
  /**
   * Machine callers that authenticate with a secret (the till app's session
   * exchange, push registration). Wider burst, because a shop floor is one
   * NAT address; shorter memory, because a real device retrying after a
   * network blip is not an attacker.
   */
  'api-device': {
    tiers: [
      { label: 'burst', limit: 60, windowSeconds: 10 },
      { label: 'sustained', limit: 900, windowSeconds: 300 },
      { label: 'daily', limit: 20000, windowSeconds: 86400 },
    ],
    penalty: { baseSeconds: 5, multiplier: 2, maxSeconds: 300, strikeTtlSeconds: 900 },
    reason: 'till and mobile devices behind one address; tolerant of retries',
  },
} as const satisfies Record<string, GraduatedPolicy>

export type GraduatedPolicyName = keyof typeof GRADUATED_POLICIES

export function graduatedPolicy(name: GraduatedPolicyName): GraduatedPolicy {
  return GRADUATED_POLICIES[name]
}

/** `rl:v1:g:` so the graduated keys can never collide with a flat policy's bucket. */
export function graduatedKey(name: string, tier: string, identifier: string): string {
  return `rl:v1:g:${name}:${tier}:${identifier}`
}

export function penaltyKey(name: string, identifier: string): string {
  return `rl:v1:g:${name}:penalty:${identifier}`
}

export function strikeKey(name: string, identifier: string): string {
  return `rl:v1:g:${name}:strikes:${identifier}`
}

/**
 * The cooldown for the N-th strike: base, then base times multiplier per
 * further strike, never past the cap. Pure, so the escalation curve is
 * testable without Redis.
 */
export function cooldownSeconds(penalty: PenaltyPolicy, strikes: number): number {
  const n = Math.max(1, Math.floor(strikes))
  const raw = penalty.baseSeconds * penalty.multiplier ** (n - 1)
  return Math.min(penalty.maxSeconds, Math.max(1, Math.round(raw)))
}

export type GraduatedDecision = {
  allowed: boolean
  /** Which tier refused, or `penalty` while a cooldown runs. Null when allowed. */
  refusedBy: GraduatedTier['label'] | 'penalty' | null
  /** Strikes on record after this request, when Upstash answered. */
  strikes: number | null
  /** Seconds the caller should wait. Null when allowed. */
  retryAfterSeconds: number | null
  /** The tightest tier's headers, so `rateLimitHeaders` can render them. */
  tier: RateLimitDecision
  backend: 'upstash' | 'open'
}

export type GraduatedOptions = {
  nowMs?: number
  env?: NodeJS.ProcessEnv
}

function openDecision(policy: GraduatedPolicy): GraduatedDecision {
  const first = policy.tiers[0] as GraduatedTier
  return {
    allowed: true,
    refusedBy: null,
    strikes: null,
    retryAfterSeconds: null,
    tier: {
      allowed: true,
      limit: first.limit,
      windowSeconds: first.windowSeconds,
      remaining: null,
      resetAtMs: null,
      backend: 'open',
    },
    backend: 'open',
  }
}

function toInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null
}

/** Remaining cooldown in ms, 0 when none. `PTTL` answers -2 (no key) or -1 (no expiry). */
async function activePenaltyMs(config: UpstashConfig, key: string): Promise<number> {
  const ttl = toInt(await command(config, ['PTTL', key]))
  return ttl !== null && ttl > 0 ? ttl : 0
}

/**
 * One strike more, and a cooldown sized to the total. Two commands and a SET,
 * not a script: the strike counter's exactness does not matter the way the
 * window's does (an off-by-one strike changes a cooldown by one doubling, not
 * whether a request is admitted), and the SET with PX is atomic on its own.
 */
async function escalate(
  config: UpstashConfig,
  name: string,
  identifier: string,
  penalty: PenaltyPolicy,
): Promise<{ strikes: number; cooldownSeconds: number }> {
  const sKey = strikeKey(name, identifier)
  const strikes = toInt(await command(config, ['INCR', sKey])) ?? 1
  await command(config, ['EXPIRE', sKey, String(penalty.strikeTtlSeconds)])
  const cooldown = cooldownSeconds(penalty, strikes)
  await command(config, [
    'SET',
    penaltyKey(name, identifier),
    String(strikes),
    'PX',
    String(cooldown * 1000),
  ])
  return { strikes, cooldownSeconds: cooldown }
}

/**
 * The decision. Reads the penalty first (one round trip, answers the common
 * refusal cheaply), then walks the tiers narrowest first and stops at the
 * first refusal. Every allowed request is counted in every tier; a request
 * refused at tier k was counted in tiers before k, which is the conservative
 * side to err on.
 */
export async function graduatedRateLimit(
  name: GraduatedPolicyName,
  identifier: string,
  options: GraduatedOptions = {},
): Promise<GraduatedDecision> {
  const policy = graduatedPolicy(name)
  const config = upstashConfig(options.env ?? process.env)
  if (!config) return openDecision(policy)

  const nowMs = options.nowMs ?? Date.now()

  try {
    const penaltyMs = await activePenaltyMs(config, penaltyKey(name, identifier))
    if (penaltyMs > 0) {
      const retryAfterSeconds = Math.max(1, Math.ceil(penaltyMs / 1000))
      const strikes = toInt(await command(config, ['GET', strikeKey(name, identifier)]))
      const first = policy.tiers[0] as GraduatedTier
      return {
        allowed: false,
        refusedBy: 'penalty',
        strikes,
        retryAfterSeconds,
        tier: {
          allowed: false,
          limit: first.limit,
          windowSeconds: first.windowSeconds,
          remaining: 0,
          resetAtMs: nowMs + penaltyMs,
          backend: 'upstash',
        },
        backend: 'upstash',
      }
    }

    let tightest: RateLimitDecision | null = null
    for (const tier of policy.tiers) {
      const state = await evaluateWindow(config, {
        key: graduatedKey(name, tier.label, identifier),
        nowMs,
        windowMs: tier.windowSeconds * 1000,
        limit: tier.limit,
        member: crypto.randomUUID(),
      })
      if (!state) throw new Error(`unreadable window state for ${tier.label}`)

      const decision: RateLimitDecision = {
        allowed: state.allowed,
        limit: tier.limit,
        windowSeconds: tier.windowSeconds,
        remaining: Math.max(0, tier.limit - state.used),
        resetAtMs: state.resetAtMs,
        backend: 'upstash',
      }

      if (!state.allowed) {
        const { strikes, cooldownSeconds: cooldown } = await escalate(
          config,
          name,
          identifier,
          policy.penalty,
        )
        const windowWait = Math.max(1, Math.ceil((state.resetAtMs - nowMs) / 1000))
        const retryAfterSeconds = Math.max(cooldown, windowWait)
        log.warn('rate_limit.graduated_refused', {
          policy: name,
          tier: tier.label,
          strikes,
          retryAfterSeconds,
        })
        return {
          allowed: false,
          refusedBy: tier.label,
          strikes,
          retryAfterSeconds,
          tier: { ...decision, resetAtMs: nowMs + retryAfterSeconds * 1000 },
          backend: 'upstash',
        }
      }

      // The tier with the fewest requests left is the one the caller should
      // pace against; ties go to the narrower window, which was walked first.
      if (!tightest || (decision.remaining as number) < (tightest.remaining as number)) {
        tightest = decision
      }
    }

    return {
      allowed: true,
      refusedBy: null,
      strikes: null,
      retryAfterSeconds: null,
      tier: tightest as RateLimitDecision,
      backend: 'upstash',
    }
  } catch (error) {
    // Same policy as the flat limiter and for the same reason: an Upstash
    // outage must not take the shop with it. Loud, not sampled.
    log.error('rate_limit.graduated_open', {
      policy: name,
      reason: error instanceof Error ? error.message : String(error),
    })
    return openDecision(policy)
  }
}
