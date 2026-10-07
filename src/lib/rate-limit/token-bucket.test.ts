import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * An in-memory Upstash that implements the one command token-bucket.ts sends:
 * the EVAL. The JS below mirrors the Lua line for line, so what these tests
 * pin is the arithmetic the script is meant to run and the way the module
 * drives it; the Lua text itself is pinned by the script-shape test, because
 * there is no Lua interpreter on this machine to run it.
 */
const fake = vi.hoisted(() => {
  const state = {
    now: 1_700_000_000_000,
    buckets: new Map<string, { tokens: number; ts: number; ttlMs: number }>(),
    calls: [] as string[][],
    failing: false,
    answer: undefined as unknown,
  }

  async function command(_config: unknown, args: readonly string[]): Promise<unknown> {
    state.calls.push([...args])
    if (state.failing) throw new Error('upstash down')
    if (state.answer !== undefined) return state.answer
    const [op] = args
    if (op !== 'EVAL') throw new Error(`fake upstash: unsupported ${op}`)
    const [, , , key, nowRaw, capRaw, refillRaw, periodRaw, costRaw] = args as string[]
    const now = Number(nowRaw)
    const capacity = Number(capRaw)
    const refill = Number(refillRaw)
    const period = Number(periodRaw)
    const cost = Number(costRaw)
    const entry = state.buckets.get(key as string) ?? { tokens: capacity, ts: now, ttlMs: 0 }
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
    entry.ttlMs = Math.ceil((capacity * period) / refill) + 1000
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

const { bucketTtlMs, evaluateBucket, parseBucketState, tokenBucketScript } = await import(
  './token-bucket'
)

const config = { url: 'https://fake.upstash.io', token: 'token-0123456789', timeoutMs: 1000 }
const FIVE_A_MINUTE = { capacity: 5, refillTokens: 5, refillPeriodMs: 60_000 }

function take(key = 'rl:v1:tb:auth:ip:203.0.113.7', shape = FIVE_A_MINUTE) {
  return evaluateBucket(config, { key, nowMs: fake.state.now, shape })
}

beforeEach(() => fake.reset())

describe('the script', () => {
  const script = tokenBucketScript()

  it('reads every argument through tonumber, so a string never reaches the arithmetic', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(script).toContain(`tonumber(ARGV[${n}])`)
    expect(script).toContain('tonumber(stored[1])')
    expect(script).toContain('tonumber(stored[2])')
  })

  it('keeps the bucket as one hash with a TTL, and returns four integers', () => {
    expect(script).toContain("redis.call('HMGET', key, 'tokens', 'ts')")
    expect(script).toContain("redis.call('HSET', key, 'tokens', tokens, 'ts', ts)")
    expect(script).toContain("redis.call('PEXPIRE', key,")
    // Redis truncates Lua floats on the way out; the script rounds itself.
    expect(script).toContain('return {allowed, math.floor(tokens), retry, full}')
    expect(script).toContain('retry = math.ceil(')
    expect(script).toContain('local full = math.ceil(')
  })

  it('refills only when the clock moved forward, so a skewed region cannot credit time twice', () => {
    expect(script).toContain('if now > ts then')
    expect(script).not.toContain('if now >= ts then')
  })
})

describe('evaluateBucket', () => {
  it('sends EVAL with one key and every argument as a string, in the script’s order', async () => {
    await take()
    const [call] = fake.state.calls
    expect(call?.slice(0, 1)).toEqual(['EVAL'])
    expect(call?.[1]).toBe(tokenBucketScript())
    expect(call?.slice(2)).toEqual([
      '1',
      'rl:v1:tb:auth:ip:203.0.113.7',
      String(fake.state.now),
      '5',
      '5',
      '60000',
      '1',
    ])
  })

  it('admits a full burst of `capacity`, then refuses with the wait for one token', async () => {
    for (let i = 0; i < 5; i++) {
      const state = await take()
      expect(state?.allowed).toBe(true)
      expect(state?.tokens).toBe(4 - i)
    }
    const refused = await take()
    expect(refused).toEqual({ allowed: false, tokens: 0, retryAfterMs: 12_000, fullInMs: 60_000 })
  })

  it('hands back exactly one token per refill interval', async () => {
    for (let i = 0; i < 6; i++) await take()
    fake.state.now += 11_999
    expect((await take())?.allowed).toBe(false)
    fake.state.now += 1
    const admitted = await take()
    expect(admitted?.allowed).toBe(true)
    expect(admitted?.tokens).toBe(0)
    // Spent the one that landed; the next is a full interval away again.
    expect((await take())?.retryAfterMs).toBe(12_000)
  })

  it('is full again after one period and never above capacity', async () => {
    for (let i = 0; i < 5; i++) await take()
    fake.state.now += 600_000
    const state = await take()
    expect(state?.allowed).toBe(true)
    expect(state?.tokens).toBe(4)
    expect(state?.fullInMs).toBe(12_000)
  })

  it('reports zero wait and zero time-to-full on a fresh bucket', async () => {
    const state = await take()
    expect(state?.retryAfterMs).toBe(0)
    expect(state?.fullInMs).toBe(12_000)
  })

  it('keeps one key’s tokens off another key', async () => {
    for (let i = 0; i < 6; i++) await take('rl:v1:tb:auth:ip:203.0.113.7')
    expect((await take('rl:v1:tb:auth:ip:198.51.100.9'))?.allowed).toBe(true)
  })

  it('does not refill when the clock goes backwards', async () => {
    for (let i = 0; i < 5; i++) await take()
    fake.state.now -= 30_000
    expect((await take())?.allowed).toBe(false)
  })

  it('sets a TTL of one fill time plus a second, so an idle key expires at capacity', async () => {
    await take()
    expect(fake.state.buckets.get('rl:v1:tb:auth:ip:203.0.113.7')?.ttlMs).toBe(61_000)
    expect(bucketTtlMs(FIVE_A_MINUTE)).toBe(61_000)
    expect(bucketTtlMs({ capacity: 30, refillTokens: 30, refillPeriodMs: 60_000 })).toBe(61_000)
    expect(bucketTtlMs({ capacity: 10, refillTokens: 1, refillPeriodMs: 1000 })).toBe(11_000)
  })

  it('charges a cost greater than one as one decision', async () => {
    const state = await evaluateBucket(config, {
      key: 'k',
      nowMs: fake.state.now,
      shape: FIVE_A_MINUTE,
      cost: 3,
    })
    expect(state?.tokens).toBe(2)
    expect(fake.state.calls[0]?.at(-1)).toBe('3')
  })

  it('answers null, not a decision, when Upstash returns a shape it does not recognise', async () => {
    fake.state.answer = [1, 4]
    expect(await take()).toBeNull()
    fake.state.answer = 'OK'
    expect(await take()).toBeNull()
  })

  it('propagates a transport failure to the caller, which decides the fail-open', async () => {
    fake.state.failing = true
    await expect(take()).rejects.toThrow('upstash down')
  })
})

describe('parseBucketState', () => {
  it('accepts numbers and numeric strings alike', () => {
    expect(parseBucketState([1, 4, 0, 12000])).toEqual({
      allowed: true,
      tokens: 4,
      retryAfterMs: 0,
      fullInMs: 12000,
    })
    expect(parseBucketState(['0', '0', '12000', '60000'])).toEqual({
      allowed: false,
      tokens: 0,
      retryAfterMs: 12000,
      fullInMs: 60000,
    })
  })

  it('rejects anything that would render as NaN in a header', () => {
    expect(parseBucketState([1, 4, 'soon', 12000])).toBeNull()
    expect(parseBucketState([1, 4, 0])).toBeNull()
    expect(parseBucketState(null)).toBeNull()
    expect(parseBucketState({ allowed: 1 })).toBeNull()
  })
})
