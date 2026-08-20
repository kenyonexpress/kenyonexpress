import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const createAdminClient = vi.fn(() => ({ rpc }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

const logError = vi.fn()
const logWarn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...a: unknown[]) => logError(...a),
    warn: (...a: unknown[]) => logWarn(...a),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { rateLimit, rateLimitByKey } from './limiter'

const URL_VAR = 'UPSTASH_REDIS_REST_URL'
const TOKEN_VAR = 'UPSTASH_REDIS_REST_TOKEN'

function configureUpstash() {
  process.env[URL_VAR] = 'https://eu1.upstash.io'
  process.env[TOKEN_VAR] = 'tok'
}

function upstashReplies(result: unknown, status = 200) {
  const spy = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(result), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

function upstashUnreachable() {
  const spy = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))
  vi.stubGlobal('fetch', spy)
  return spy
}

/**
 * `Reflect.deleteProperty`, not `delete` and NOT `= undefined`. Node's
 * `process.env` setter coerces its value to a string, so `= undefined` stores
 * the four-letter string `"undefined"` - which is truthy, passes the config
 * check, and would send every request in this file at a host called
 * "undefined". `delete` is correct but trips `lint/performance/noDelete`.
 */
function unsetUpstashEnv(): void {
  Reflect.deleteProperty(process.env, 'UPSTASH_REDIS_REST_URL')
  Reflect.deleteProperty(process.env, 'UPSTASH_REDIS_REST_TOKEN')
  Reflect.deleteProperty(process.env, 'UPSTASH_REDIS_REST_TIMEOUT_MS')
}

beforeEach(() => {
  unsetUpstashEnv()
  rpc.mockReset().mockResolvedValue({ data: true, error: null })
  createAdminClient.mockReset().mockReturnValue({ rpc })
  logError.mockReset()
  logWarn.mockReset()
})

afterEach(() => {
  unsetUpstashEnv()
  vi.restoreAllMocks()
})

const keys = { redis: 'rl:v1:login:203.0.113.5', postgres: 'login:203.0.113.5' }

/**
 * `vi.fn()` types its `calls` as possibly-empty, and under
 * `noUncheckedIndexedAccess` indexing it yields `undefined`. Casting that away
 * at each use site would also cast away the case this throws for: a test that
 * asserts on the body of a request the code never sent, and passes because
 * `undefined` matched nothing.
 */
function fetchCall(
  spy: { mock: { calls: unknown[] } },
  index = 0,
): [string, RequestInit & { cache?: string }] {
  const call = spy.mock.calls[index] as [string, RequestInit & { cache?: string }] | undefined
  if (!call) throw new Error(`fetch call #${index} was never made`)
  return call
}

function requestBody(spy: { mock: { calls: unknown[] } }, index = 0): string[] {
  return JSON.parse(fetchCall(spy, index)[1].body as string) as string[]
}

describe('the backend chain', () => {
  /**
   * The baseline, and the reason Postgres stays in the chain: no environment
   * this repo can see sets the two Upstash variables today. If merging this
   * layer required them, it would turn every limit in the app off.
   */
  it('goes straight to Postgres when Upstash is not configured, and never calls fetch', async () => {
    const fetchSpy = upstashReplies({ result: [1, 4, 1_700_000_060_000] })

    const decision = await rateLimitByKey(keys, 10, 3600, { nowMs: 1_700_000_000_000 })

    expect(decision).toEqual({
      allowed: true,
      limit: 10,
      windowSeconds: 3600,
      remaining: null,
      resetAtMs: null,
      backend: 'postgres',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('reads the count and the reset time back from Upstash', async () => {
    configureUpstash()
    upstashReplies({ result: [1, 4, 1_700_000_060_000] })

    const decision = await rateLimitByKey(keys, 10, 3600, { nowMs: 1_700_000_000_000 })

    expect(decision).toEqual({
      allowed: true,
      limit: 10,
      windowSeconds: 3600,
      remaining: 6,
      resetAtMs: 1_700_000_060_000,
      backend: 'upstash',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses when the window is full, and never reports negative remaining', async () => {
    configureUpstash()
    // `used` comes back at the limit on a refusal, and a script change that
    // returned more than the limit must not produce `remaining: -2`.
    upstashReplies({ result: [0, 12, 1_700_000_060_000] })

    const decision = await rateLimitByKey(keys, 10, 3600, { nowMs: 1_700_000_000_000 })

    expect(decision.allowed).toBe(false)
    expect(decision.remaining).toBe(0)
  })

  it('falls back to Postgres when Upstash is unreachable, on the SAME key', async () => {
    configureUpstash()
    upstashUnreachable()

    const decision = await rateLimitByKey(keys, 5, 3600)

    expect(decision.backend).toBe('postgres')
    expect(decision.allowed).toBe(true)
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'login:203.0.113.5',
      p_max_attempts: 5,
      p_window_seconds: 3600,
    })
    expect(logWarn).toHaveBeenCalledWith(
      'rate_limit.upstash_failed',
      expect.objectContaining({ key: keys.redis }),
    )
  })

  it('falls back when Upstash answers something it cannot read', async () => {
    configureUpstash()
    upstashReplies({ result: 'OK' })

    expect((await rateLimitByKey(keys, 5, 3600)).backend).toBe('postgres')
    expect(logWarn).toHaveBeenCalledWith('rate_limit.upstash_unreadable', { key: keys.redis })
  })

  it('carries the Postgres refusal through unchanged', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    const decision = await rateLimitByKey(keys, 5, 3600)
    expect(decision.allowed).toBe(false)
    expect(decision.backend).toBe('postgres')
  })

  /**
   * The property the whole chain exists for: an outage must not log every
   * customer out of checkout. Inherited from the two functions this replaced,
   * both of which returned `true` on any error.
   */
  it('fails open and says so at error level when both backends are gone', async () => {
    configureUpstash()
    upstashUnreachable()
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    const decision = await rateLimitByKey(keys, 5, 3600)

    expect(decision).toEqual({
      allowed: true,
      limit: 5,
      windowSeconds: 3600,
      remaining: null,
      resetAtMs: null,
      backend: 'open',
    })
    expect(logError).toHaveBeenCalledWith('rate_limit.open', {
      key: 'login:203.0.113.5',
      limit: 5,
      windowSeconds: 3600,
    })
  })

  it('fails open when there is no service key either', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    })
    const decision = await rateLimitByKey(keys, 5, 3600)
    expect(decision.backend).toBe('open')
    expect(logError).toHaveBeenCalledWith('rate_limit.admin_client_unavailable', {
      reason: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    })
  })
})

describe('rateLimit', () => {
  it('takes the numbers from the table so no call site writes them', async () => {
    await rateLimit('phone-otp-number', '+972500000000')
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'phone-otp-number:+972500000000',
      p_max_attempts: 5,
      p_window_seconds: 3600,
    })
  })

  it('builds the namespaced Redis key from the policy name', async () => {
    configureUpstash()
    const spy = upstashReplies({ result: [1, 1, 2] })

    await rateLimit('login', '203.0.113.5')

    expect(requestBody(spy)[3]).toBe('rl:v1:login:203.0.113.5')
  })

  it('lets a caller override the table when it owns its own constant', async () => {
    await rateLimit('analytics', '203.0.113.5', { limit: 240, windowSeconds: 60 })
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'analytics:203.0.113.5',
      p_max_attempts: 240,
      p_window_seconds: 60,
    })
  })

  it('sends each request a distinct sorted-set member', async () => {
    configureUpstash()
    const spy = upstashReplies({ result: [1, 1, 2] })

    await rateLimit('login', '203.0.113.5')
    await rateLimit('login', '203.0.113.5')

    const members = spy.mock.calls.map((_call, index) => {
      const body = requestBody(spy, index)
      return body[body.length - 1]
    })
    // Same key, same millisecond under a fake clock: identical members would
    // overwrite one score instead of counting two requests.
    expect(members[0]).not.toBe(members[1])
  })
})
