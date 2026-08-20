import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { UpstashError, command, isUpstashConfigured, tryCommand, upstashConfig } from './upstash'

const URL_VAR = 'UPSTASH_REDIS_REST_URL'
const TOKEN_VAR = 'UPSTASH_REDIS_REST_TOKEN'
const TIMEOUT_VAR = 'UPSTASH_REDIS_REST_TIMEOUT_MS'

/**
 * `Reflect.deleteProperty`, not `delete` and NOT `= undefined`. Node's
 * `process.env` setter coerces its value to a string, so `= undefined` stores
 * the four-letter string `"undefined"` - which is truthy, passes the config
 * check, and would send every request in this file at a host called
 * "undefined". `delete` is correct but trips `lint/performance/noDelete`.
 */
function clearEnv(): void {
  Reflect.deleteProperty(process.env, 'UPSTASH_REDIS_REST_URL')
  Reflect.deleteProperty(process.env, 'UPSTASH_REDIS_REST_TOKEN')
  Reflect.deleteProperty(process.env, 'UPSTASH_REDIS_REST_TIMEOUT_MS')
}

beforeEach(() => {
  clearEnv()
  logError.mockReset()
})

afterEach(() => {
  clearEnv()
  vi.restoreAllMocks()
})

describe('upstashConfig', () => {
  it('is null until both variables are set', () => {
    expect(upstashConfig()).toBeNull()
    process.env[URL_VAR] = 'https://eu1.upstash.io'
    expect(upstashConfig()).toBeNull()
    process.env[TOKEN_VAR] = 'tok'
    expect(upstashConfig()).not.toBeNull()
    expect(isUpstashConfigured()).toBe(true)
  })

  it('treats whitespace as absence', () => {
    // A variable set to the empty string in a Vercel dashboard is a very
    // ordinary way to disable something, and it must not produce a config
    // object that then fails on every request with a DNS error.
    process.env[URL_VAR] = '  '
    process.env[TOKEN_VAR] = 'tok'
    expect(upstashConfig()).toBeNull()
  })

  it('strips trailing slashes so the URL is not doubled', () => {
    process.env[URL_VAR] = 'https://eu1.upstash.io///'
    process.env[TOKEN_VAR] = 'tok'
    expect(upstashConfig()?.url).toBe('https://eu1.upstash.io')
  })

  it('defaults the timeout to one second and accepts only positive integers', () => {
    process.env[URL_VAR] = 'https://eu1.upstash.io'
    process.env[TOKEN_VAR] = 'tok'
    expect(upstashConfig()?.timeoutMs).toBe(1000)

    for (const bad of ['0', '-5', 'soon', '1.5', '']) {
      process.env[TIMEOUT_VAR] = bad
      expect(upstashConfig()?.timeoutMs, `for ${JSON.stringify(bad)}`).toBe(1000)
    }

    process.env[TIMEOUT_VAR] = '250'
    expect(upstashConfig()?.timeoutMs).toBe(250)
  })

  /**
   * The read is deliberately NOT cached at module load, unlike `LOG_LEVEL` in
   * `log.ts`. Without this, the first test in the file to import the module
   * would fix the answer for every later one.
   */
  it('re-reads the environment on every call', () => {
    process.env[URL_VAR] = 'https://a.upstash.io'
    process.env[TOKEN_VAR] = 'tok'
    expect(upstashConfig()?.url).toBe('https://a.upstash.io')
    process.env[URL_VAR] = 'https://b.upstash.io'
    expect(upstashConfig()?.url).toBe('https://b.upstash.io')
  })
})

const config = { url: 'https://eu1.upstash.io', token: 'tok', timeoutMs: 1000 }

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

function mockFetch(impl: (input: unknown, init: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl as never)
  vi.stubGlobal('fetch', spy)
  return spy
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('command', () => {
  it('POSTs the command array as JSON with a bearer token', async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ result: 'PONG' }))

    expect(await command(config, ['PING'])).toBe('PONG')

    const [url, init] = fetchCall(fetchSpy)
    expect(url).toBe('https://eu1.upstash.io')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(init.body).toBe('["PING"]')
  })

  /**
   * Next patches the global `fetch` and caches GETs by default. A counter read
   * out of a cache is not a counter, so the opt-out is asserted rather than
   * assumed.
   */
  it('opts out of the fetch cache', async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ result: 1 }))
    await command(config, ['INCR', 'k'])
    const [, init] = fetchCall(fetchSpy)
    expect(init.cache).toBe('no-store')
  })

  it('carries an abort signal, so a hung Redis cannot hold the request open', async () => {
    const fetchSpy = mockFetch(() => jsonResponse({ result: 1 }))
    await command(config, ['PING'])
    const [, init] = fetchCall(fetchSpy)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports a non-2xx as a transport failure and keeps the body', async () => {
    mockFetch(() => new Response('invalid token', { status: 401 }))
    await expect(command(config, ['PING'])).rejects.toMatchObject({
      kind: 'transport',
      message: 'HTTP 401 invalid token',
    })
  })

  it('reports a Redis-level error separately from a transport one', async () => {
    mockFetch(() => jsonResponse({ error: 'ERR unknown command' }))
    await expect(command(config, ['NOPE'])).rejects.toMatchObject({ kind: 'redis' })
  })

  it('reports an unparseable body as a protocol failure', async () => {
    mockFetch(() => new Response('<html>502</html>', { status: 200 }))
    await expect(command(config, ['PING'])).rejects.toBeInstanceOf(UpstashError)
    mockFetch(() => new Response('<html>502</html>', { status: 200 }))
    await expect(command(config, ['PING'])).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('names a timeout as a timeout, not as a generic transport error', async () => {
    mockFetch(() => {
      const error = new Error('The operation was aborted due to timeout')
      error.name = 'TimeoutError'
      return Promise.reject(error)
    })
    await expect(command(config, ['PING'])).rejects.toMatchObject({ kind: 'timeout' })
  })
})

describe('tryCommand', () => {
  it('returns the result on success', async () => {
    mockFetch(() => jsonResponse({ result: 7 }))
    expect(await tryCommand(config, ['ZCARD', 'k'], 'test.event')).toBe(7)
  })

  it('returns null and logs the kind on failure', async () => {
    mockFetch(() => jsonResponse({ error: 'ERR boom' }))
    expect(await tryCommand(config, ['ZCARD', 'k'], 'test.event')).toBeNull()
    expect(logError).toHaveBeenCalledWith('test.event', { reason: 'ERR boom', kind: 'redis' })
  })
})
