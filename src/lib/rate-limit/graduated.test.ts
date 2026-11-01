import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * An in-memory Upstash. Implements exactly the commands graduated.ts sends:
 * the sliding-window EVAL, PTTL, INCR, EXPIRE, SET ... PX and GET. Time is
 * injected so a cooldown can be walked without sleeping.
 */
const fake = vi.hoisted(() => {
  const state = {
    now: 1_700_000_000_000,
    windows: new Map<string, number[]>(),
    values: new Map<string, { value: string; expiresAt: number | null }>(),
    calls: [] as string[][],
    failing: false,
  }

  function live(key: string) {
    const entry = state.values.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt <= state.now) {
      state.values.delete(key)
      return null
    }
    return entry
  }

  async function command(_config: unknown, args: readonly string[]): Promise<unknown> {
    state.calls.push([...args])
    if (state.failing) throw new Error('upstash down')
    const [op] = args
    switch (op) {
      case 'EVAL': {
        const [, , , key, nowRaw, windowRaw, limitRaw] = args as string[]
        const now = Number(nowRaw)
        const windowMs = Number(windowRaw)
        const limit = Number(limitRaw)
        const members = (state.windows.get(key as string) ?? []).filter((t) => t > now - windowMs)
        if (members.length >= limit) {
          state.windows.set(key as string, members)
          return [0, members.length, (members[0] as number) + windowMs]
        }
        members.push(now)
        state.windows.set(key as string, members)
        return [1, members.length, now + windowMs]
      }
      case 'PTTL': {
        const entry = live(args[1] as string)
        if (!entry) return -2
        return entry.expiresAt === null ? -1 : entry.expiresAt - state.now
      }
      case 'GET':
        return live(args[1] as string)?.value ?? null
      case 'INCR': {
        const entry = live(args[1] as string)
        const next = (entry ? Number(entry.value) : 0) + 1
        state.values.set(args[1] as string, {
          value: String(next),
          expiresAt: entry?.expiresAt ?? null,
        })
        return next
      }
      case 'EXPIRE': {
        const entry = live(args[1] as string)
        if (!entry) return 0
        entry.expiresAt = state.now + Number(args[2]) * 1000
        return 1
      }
      case 'SET': {
        const px = args.indexOf('PX')
        state.values.set(args[1] as string, {
          value: args[2] as string,
          expiresAt: px > 0 ? state.now + Number(args[px + 1]) : null,
        })
        return 'OK'
      }
      default:
        throw new Error(`fake upstash: unsupported ${op}`)
    }
  }

  function reset() {
    state.now = 1_700_000_000_000
    state.windows.clear()
    state.values.clear()
    state.calls.length = 0
    state.failing = false
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

const { GRADUATED_POLICIES, cooldownSeconds, graduatedRateLimit } = await import('./graduated')

const ENV = {
  UPSTASH_REDIS_REST_URL: 'https://fake.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token-0123456789',
} as unknown as NodeJS.ProcessEnv

function limit(identifier = '203.0.113.7') {
  return graduatedRateLimit('api-anon', identifier, { nowMs: fake.state.now, env: ENV })
}

beforeEach(() => fake.reset())
afterEach(() => {
  logged.warn.mockClear()
  logged.error.mockClear()
})

describe('cooldownSeconds', () => {
  const penalty = { baseSeconds: 10, multiplier: 2, maxSeconds: 900, strikeTtlSeconds: 3600 }

  it('doubles per strike from the base', () => {
    expect(cooldownSeconds(penalty, 1)).toBe(10)
    expect(cooldownSeconds(penalty, 2)).toBe(20)
    expect(cooldownSeconds(penalty, 3)).toBe(40)
    expect(cooldownSeconds(penalty, 4)).toBe(80)
  })

  it('never exceeds the cap, so a mistaken block always ends', () => {
    expect(cooldownSeconds(penalty, 10)).toBe(900)
    expect(cooldownSeconds(penalty, 1000)).toBe(900)
  })

  it('treats a zero or negative strike count as the first strike', () => {
    expect(cooldownSeconds(penalty, 0)).toBe(10)
    expect(cooldownSeconds(penalty, -3)).toBe(10)
  })
})

describe('the policy table', () => {
  it('orders every policy narrowest window first, so the walk stops at the tightest tier', () => {
    for (const [name, policy] of Object.entries(GRADUATED_POLICIES)) {
      const windows = policy.tiers.map((t) => t.windowSeconds)
      expect(windows, name).toEqual([...windows].sort((a, b) => a - b))
      const limits = policy.tiers.map((t) => t.limit)
      expect(limits, name).toEqual([...limits].sort((a, b) => a - b))
    }
  })

  it('caps every cooldown below an hour', () => {
    for (const policy of Object.values(GRADUATED_POLICIES)) {
      expect(policy.penalty.maxSeconds).toBeLessThanOrEqual(3600)
      expect(policy.penalty.baseSeconds).toBeGreaterThan(0)
    }
  })
})

describe('graduatedRateLimit', () => {
  it('is open when Upstash is not configured, and says so', async () => {
    const decision = await graduatedRateLimit('api-anon', 'x', { env: {} as NodeJS.ProcessEnv })
    expect(decision.allowed).toBe(true)
    expect(decision.backend).toBe('open')
    expect(fake.state.calls).toEqual([])
  })

  it('admits a request under every tier and reports the tightest remaining', async () => {
    const decision = await limit()
    expect(decision.allowed).toBe(true)
    expect(decision.backend).toBe('upstash')
    // burst: 30, so 29 left after one request; the daily tier has 4999 left.
    expect(decision.tier.limit).toBe(30)
    expect(decision.tier.remaining).toBe(29)
    expect(decision.refusedBy).toBeNull()
  })

  it('refuses at the burst tier and records the first strike', async () => {
    for (let i = 0; i < 30; i++) expect((await limit()).allowed).toBe(true)
    const refused = await limit()
    expect(refused.allowed).toBe(false)
    expect(refused.refusedBy).toBe('burst')
    expect(refused.strikes).toBe(1)
    expect(refused.retryAfterSeconds).toBe(10)
    expect(logged.warn).toHaveBeenCalledWith(
      'rate_limit.graduated_refused',
      expect.objectContaining({ tier: 'burst', strikes: 1 }),
    )
  })

  it('answers from the penalty alone while the cooldown runs, without touching the windows', async () => {
    for (let i = 0; i < 31; i++) await limit()
    fake.state.calls.length = 0

    fake.state.now += 3_000
    const decision = await limit()
    expect(decision.allowed).toBe(false)
    expect(decision.refusedBy).toBe('penalty')
    expect(decision.retryAfterSeconds).toBe(7)
    expect(fake.state.calls.map((c) => c[0])).toEqual(['PTTL', 'GET'])
  })

  it('escalates the cooldown on every further refusal', async () => {
    for (let i = 0; i < 31; i++) await limit()
    // Wait out the first cooldown (10s); the burst window drains at the same
    // moment, so fill it again and the next refusal is the second strike.
    fake.state.now += 10_000
    for (let i = 0; i < 30; i++) expect((await limit()).allowed).toBe(true)
    const second = await limit()
    expect(second.refusedBy).toBe('burst')
    expect(second.strikes).toBe(2)
    expect(second.retryAfterSeconds).toBe(20)

    fake.state.now += 20_000
    // Window has drained by now; make it refuse again by filling it.
    for (let i = 0; i < 30; i++) await limit()
    const third = await limit()
    expect(third.strikes).toBe(3)
    expect(third.retryAfterSeconds).toBe(40)
  })

  it('forgets strikes after the strike TTL', async () => {
    for (let i = 0; i < 31; i++) await limit()
    fake.state.now += 3600_000 + 1
    for (let i = 0; i < 30; i++) await limit()
    const refused = await limit()
    expect(refused.strikes).toBe(1)
  })

  it('keeps one caller’s strikes off another caller', async () => {
    for (let i = 0; i < 31; i++) await limit('203.0.113.7')
    const other = await limit('198.51.100.9')
    expect(other.allowed).toBe(true)
  })

  it('refuses at the sustained tier once the burst tier is paced but the total is not', async () => {
    // 300 requests spread at one every 0.9s never trip burst (30/10s: eleven
    // per window) but fill sustained (300 inside 270s of a 300s window).
    for (let i = 0; i < 300; i++) {
      const d = await limit()
      expect(d.allowed).toBe(true)
      fake.state.now += 900
    }
    const refused = await limit()
    expect(refused.allowed).toBe(false)
    expect(refused.refusedBy).toBe('sustained')
  })

  it('fails open and loud when Upstash throws', async () => {
    fake.state.failing = true
    const decision = await limit()
    expect(decision.allowed).toBe(true)
    expect(decision.backend).toBe('open')
    expect(logged.error).toHaveBeenCalledWith(
      'rate_limit.graduated_open',
      expect.objectContaining({ policy: 'api-anon' }),
    )
  })
})
