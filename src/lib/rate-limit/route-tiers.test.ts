import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The same in-memory bucket as token-bucket.test.ts, driven through the tier API. */
const fake = vi.hoisted(() => {
  const state = {
    now: 1_700_000_000_000,
    buckets: new Map<string, { tokens: number; ts: number }>(),
    calls: [] as string[][],
    failing: false,
    answer: undefined as unknown,
  }

  async function command(_config: unknown, args: readonly string[]): Promise<unknown> {
    state.calls.push([...args])
    if (state.failing) throw new Error('upstash down')
    if (state.answer !== undefined) return state.answer
    const [, , , key, nowRaw, capRaw, refillRaw, periodRaw, costRaw] = args as string[]
    const now = Number(nowRaw)
    const capacity = Number(capRaw)
    const refill = Number(refillRaw)
    const period = Number(periodRaw)
    const cost = Number(costRaw)
    const entry = state.buckets.get(key as string) ?? { tokens: capacity, ts: now }
    if (now > entry.ts) {
      entry.tokens = Math.min(capacity, entry.tokens + ((now - entry.ts) * refill) / period)
      entry.ts = now
    }
    let allowed = 0
    let retry = 0
    if (entry.tokens >= cost) {
      entry.tokens -= cost
      allowed = 1
    } else {
      retry = Math.ceil(((cost - entry.tokens) * period) / refill)
    }
    state.buckets.set(key as string, entry)
    const full = Math.ceil(((capacity - entry.tokens) * period) / refill)
    return [allowed, Math.floor(entry.tokens), retry, full]
  }

  function reset() {
    state.now = 1_700_000_000_000
    state.buckets.clear()
    state.calls.length = 0
    state.failing = false
    state.answer = undefined
  }

  return { state, command, reset }
})

vi.mock('./upstash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./upstash')>()
  return { ...actual, command: fake.command }
})

const logged = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: logged.warn, error: logged.error },
}))

const { graduatedKey } = await import('./graduated')
const { rateLimitHeaders } = await import('./headers')
const { redisKey } = await import('./policies')
const { ROUTE_TIERS, routeTierFor, routeTierIdentity, routeTierKey, routeTierRateLimit } =
  await import('./route-tiers')

const ENV = {
  UPSTASH_REDIS_REST_URL: 'https://fake.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token-0123456789',
} as unknown as NodeJS.ProcessEnv

type Tier = keyof typeof ROUTE_TIERS

function limit(tier: Tier = 'auth', identity = 'ip:203.0.113.7') {
  return routeTierRateLimit(tier, identity, { nowMs: fake.state.now, env: ENV })
}

beforeEach(() => fake.reset())
afterEach(() => {
  logged.warn.mockClear()
  logged.error.mockClear()
})

describe('ROUTE_TIERS', () => {
  it('holds the three rates the brief named, per minute, with burst equal to the rate', () => {
    const perMinute = Object.fromEntries(
      Object.entries(ROUTE_TIERS).map(([name, t]) => [
        name,
        (t.refillTokens * 60_000) / t.refillPeriodMs,
      ]),
    )
    expect(perMinute).toEqual({ auth: 5, search: 30, checkout: 3 })
    for (const t of Object.values(ROUTE_TIERS)) expect(t.capacity).toBe(t.refillTokens)
  })

  it('gives every tier a reason', () => {
    for (const [name, t] of Object.entries(ROUTE_TIERS)) {
      expect(t.reason.length, name).toBeGreaterThan(20)
    }
  })
})

describe('routeTierFor', () => {
  it('meters a POST to each auth page as auth, and a GET of the form as nothing', () => {
    for (const path of [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/mfa',
      '/supplier/login',
    ]) {
      expect(routeTierFor('POST', path), path).toBe('auth')
      expect(routeTierFor('GET', path), path).toBeNull()
    }
    expect(routeTierFor('post', '/login')).toBe('auth')
    expect(routeTierFor('POST', '/login/')).toBe('auth')
  })

  it('meters the pay press and nothing else under /checkout', () => {
    expect(routeTierFor('POST', '/checkout')).toBe('checkout')
    expect(routeTierFor('GET', '/checkout')).toBeNull()
    // The return pages read an order; the frame return is Cardcom's navigation.
    expect(routeTierFor('POST', '/checkout/return')).toBeNull()
    expect(routeTierFor('GET', '/checkout/frame-return')).toBeNull()
    expect(routeTierFor('POST', '/checkout/failed')).toBeNull()
  })

  it('meters the two query routes as search on any method, and not the typeahead', () => {
    expect(routeTierFor('GET', '/api/search')).toBe('search')
    expect(routeTierFor('GET', '/api/search/facets')).toBe('search')
    expect(routeTierFor('HEAD', '/api/search')).toBe('search')
    expect(routeTierFor('GET', '/api/search/suggest')).toBeNull()
    expect(routeTierFor('GET', '/api/search/quick-links')).toBeNull()
    expect(routeTierFor('POST', '/api/search/index-job')).toBeNull()
  })

  it('leaves the public auth callback, the cart, the webhooks and the store pages alone', () => {
    for (const [method, path] of [
      ['GET', '/auth/callback'],
      ['POST', '/cart'],
      ['POST', '/api/payments/cardcom/webhook'],
      ['POST', '/api/cron/backup'],
      ['POST', '/api/app/session'],
      ['POST', '/'],
      ['POST', '/product/some-slug'],
      ['POST', '/loginx'],
      ['POST', '/account/login'],
    ] as const) {
      expect(routeTierFor(method, path), `${method} ${path}`).toBeNull()
    }
  })
})

describe('routeTierIdentity', () => {
  it('is the address and the user together, and either alone', () => {
    expect(routeTierIdentity('203.0.113.7', 'u-1')).toBe('ip:203.0.113.7|u:u-1')
    expect(routeTierIdentity('203.0.113.7', null)).toBe('ip:203.0.113.7')
    expect(routeTierIdentity(null, 'u-1')).toBe('u:u-1')
  })

  it('is null with nothing to key on, so no `unknown` bucket is shared by everyone', () => {
    expect(routeTierIdentity(null, null)).toBeNull()
    expect(routeTierIdentity('', '')).toBeNull()
  })

  it('separates two users behind one address, and one user across two addresses', () => {
    expect(routeTierIdentity('10.0.0.1', 'a')).not.toBe(routeTierIdentity('10.0.0.1', 'b'))
    expect(routeTierIdentity('10.0.0.1', 'a')).not.toBe(routeTierIdentity('10.0.0.2', 'a'))
  })
})

describe('routeTierKey', () => {
  it('lives in its own namespace, away from the policy rows and the shield windows', () => {
    const key = routeTierKey('search', 'ip:1.2.3.4')
    expect(key).toBe('rl:v1:tb:search:ip:1.2.3.4')
    expect(key).not.toBe(redisKey('search', 'ip:1.2.3.4'))
    expect(key).not.toBe(graduatedKey('search', 'burst', 'ip:1.2.3.4'))
    expect(key.startsWith('rl:v1:')).toBe(true)
  })
})

describe('routeTierRateLimit', () => {
  it('is open when Upstash is not configured, and sends nothing', async () => {
    const verdict = await routeTierRateLimit('auth', 'ip:x', { env: {} as NodeJS.ProcessEnv })
    expect(verdict.allowed).toBe(true)
    expect(verdict.backend).toBe('open')
    expect(verdict.decision.backend).toBe('open')
    expect(fake.state.calls).toEqual([])
  })

  it('admits five auth submissions and refuses the sixth for twelve seconds', async () => {
    for (let i = 0; i < 5; i++) {
      const verdict = await limit()
      expect(verdict.allowed).toBe(true)
      expect(verdict.decision.remaining).toBe(4 - i)
      expect(verdict.retryAfterSeconds).toBeNull()
    }
    const refused = await limit()
    expect(refused.allowed).toBe(false)
    expect(refused.tier).toBe('auth')
    expect(refused.retryAfterSeconds).toBe(12)
    expect(refused.decision).toEqual({
      allowed: false,
      limit: 5,
      windowSeconds: 60,
      remaining: 0,
      resetAtMs: fake.state.now + 12_000,
      backend: 'upstash',
    })
    expect(logged.warn).toHaveBeenCalledWith('rate_limit.route_tier_refused', {
      tier: 'auth',
      retryAfterSeconds: 12,
    })
  })

  it('renders the refusal as Retry-After through the real header builder', async () => {
    for (let i = 0; i < 6; i++) await limit()
    const refused = await limit()
    const headers = rateLimitHeaders(refused.decision, fake.state.now)
    expect(headers.get('Retry-After')).toBe('12')
    expect(headers.get('RateLimit-Limit')).toBe('5')
    expect(headers.get('RateLimit-Remaining')).toBe('0')
    expect(headers.get('RateLimit-Reset')).toBe('12')
  })

  it('refuses checkout after three and search after thirty', async () => {
    for (let i = 0; i < 3; i++) expect((await limit('checkout')).allowed).toBe(true)
    const checkout = await limit('checkout')
    expect(checkout.allowed).toBe(false)
    expect(checkout.retryAfterSeconds).toBe(20)

    for (let i = 0; i < 30; i++) expect((await limit('search')).allowed).toBe(true)
    const search = await limit('search')
    expect(search.allowed).toBe(false)
    expect(search.retryAfterSeconds).toBe(2)
  })

  it('hands the next token back after the interval, one at a time', async () => {
    for (let i = 0; i < 6; i++) await limit()
    fake.state.now += 12_000
    expect((await limit()).allowed).toBe(true)
    expect((await limit()).allowed).toBe(false)
  })

  it('keeps the tiers apart: a refused checkout does not spend a search token', async () => {
    for (let i = 0; i < 4; i++) await limit('checkout')
    const search = await limit('search')
    expect(search.allowed).toBe(true)
    expect(search.decision.remaining).toBe(29)
  })

  it('keeps identities apart: the same address as another user has its own bucket', async () => {
    for (let i = 0; i < 6; i++) await limit('auth', 'ip:203.0.113.7|u:a')
    expect((await limit('auth', 'ip:203.0.113.7|u:b')).allowed).toBe(true)
    expect((await limit('auth', 'ip:203.0.113.7')).allowed).toBe(true)
  })

  it('reports the time to full on an allowed answer, so a client can pace itself', async () => {
    const first = await limit('search')
    expect(first.decision.resetAtMs).toBe(fake.state.now + 2_000)
    expect(first.decision.remaining).toBe(29)
  })

  it('fails open and loud when Upstash throws', async () => {
    fake.state.failing = true
    const verdict = await limit()
    expect(verdict.allowed).toBe(true)
    expect(verdict.backend).toBe('open')
    expect(logged.error).toHaveBeenCalledWith(
      'rate_limit.route_tier_open',
      expect.objectContaining({ tier: 'auth', reason: 'upstash down' }),
    )
  })

  it('fails open and loud when Upstash answers something unreadable', async () => {
    fake.state.answer = 'OK'
    const verdict = await limit()
    expect(verdict.allowed).toBe(true)
    expect(verdict.backend).toBe('open')
    expect(logged.error).toHaveBeenCalledWith(
      'rate_limit.route_tier_open',
      expect.objectContaining({ reason: 'unreadable bucket state' }),
    )
  })
})
