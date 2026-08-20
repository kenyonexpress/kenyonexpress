import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RATE_LIMIT_RULES,
  __test,
  clientIp,
  consumeRateLimit,
  ruleFor,
  upstashConfigured,
} from './edge-rate-limit'

function headers(ip = '203.0.113.7'): Headers {
  return new Headers({ 'x-forwarded-for': ip })
}

beforeEach(() => {
  __test.memory.clear()
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ruleFor', () => {
  it('limits /api/auth to 10 a minute and /api/checkout to 5', () => {
    expect(ruleFor('/api/auth/callback', 'POST')).toMatchObject({ limit: 10, windowSeconds: 60 })
    expect(ruleFor('/api/checkout', 'POST')).toMatchObject({ limit: 5, windowSeconds: 60 })
  })

  it('covers every path under the prefix, which is what the star means', () => {
    expect(ruleFor('/api/auth', 'GET')?.limit).toBe(10)
    expect(ruleFor('/api/auth/anything/deeper', 'GET')?.limit).toBe(10)
  })

  it('leaves the rest of the site alone', () => {
    for (const path of ['/', '/products/x', '/api/search', '/api/cart']) {
      expect(ruleFor(path, 'GET')).toBeNull()
    }
  })

  /** Looking at a login form is not an attempt at one. */
  it('counts POST on the auth pages, not GET', () => {
    expect(ruleFor('/login', 'GET')).toBeNull()
    expect(ruleFor('/login', 'POST')?.limit).toBe(10)
    expect(ruleFor('/signup', 'POST')?.limit).toBe(10)
    expect(ruleFor('/forgot-password', 'POST')?.limit).toBe(10)
    expect(ruleFor('/reset-password', 'POST')?.limit).toBe(10)
  })

  /**
   * The money path. Cardcom navigates the payment iframe to
   * /checkout/frame-return cross-site, so the address on that request belongs
   * to whatever network the shopper is on. Counting it would 429 the sixth
   * customer behind one office address after they had already been charged.
   */
  it('never counts the payment frame return, at any method', () => {
    expect(ruleFor('/checkout/frame-return', 'POST')).toBeNull()
    expect(ruleFor('/checkout/frame-return', 'GET')).toBeNull()
    expect(ruleFor('/checkout/frame-return/123', 'POST')).toBeNull()
    // ...while the checkout POST it sits under is still limited.
    expect(ruleFor('/checkout', 'POST')?.limit).toBe(5)
  })

  it('puts /api/checkout ahead of /checkout in the table', () => {
    const paths = RATE_LIMIT_RULES.map((rule) => rule.prefix)
    expect(paths.indexOf('/api/checkout')).toBeLessThan(paths.indexOf('/checkout'))
  })
})

describe('clientIp', () => {
  /**
   * The FIRST hop. The last is the proxy that wrote the header and the middle
   * ones are whatever the caller sent, so reading from the wrong end lets one
   * address present itself as ten thousand.
   */
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe(
      '1.1.1.1',
    )
  })

  it('falls back to x-real-ip, then to a constant', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('the in-memory fallback', () => {
  it('is what runs when Upstash is not configured', () => {
    expect(upstashConfigured()).toBe(false)
  })

  it('allows exactly the limit and refuses the next one', async () => {
    const seen: boolean[] = []
    for (let i = 0; i < 7; i++) {
      const verdict = await consumeRateLimit('/api/checkout', 'POST', headers())
      seen.push(verdict?.allowed ?? true)
    }
    expect(seen).toEqual([true, true, true, true, true, false, false])
  })

  it('counts each address separately', async () => {
    for (let i = 0; i < 5; i++) await consumeRateLimit('/api/checkout', 'POST', headers('1.1.1.1'))
    const blocked = await consumeRateLimit('/api/checkout', 'POST', headers('1.1.1.1'))
    const other = await consumeRateLimit('/api/checkout', 'POST', headers('2.2.2.2'))
    expect(blocked?.allowed).toBe(false)
    expect(other?.allowed).toBe(true)
  })

  it('reopens once the window rolls', async () => {
    const start = 1_000_000
    for (let i = 0; i < 6; i++) {
      await consumeRateLimit('/api/checkout', 'POST', headers(), start)
    }
    const stillBlocked = await consumeRateLimit('/api/checkout', 'POST', headers(), start + 59_000)
    const afterWindow = await consumeRateLimit('/api/checkout', 'POST', headers(), start + 61_000)
    expect(stillBlocked?.allowed).toBe(false)
    expect(afterWindow?.allowed).toBe(true)
  })

  it('returns null for an unmatched path rather than counting it', async () => {
    expect(await consumeRateLimit('/products/socks', 'GET', headers())).toBeNull()
  })
})

describe('the Upstash path', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io/'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
  })

  it('INCRs once and sets the TTL only on creation', async () => {
    const fetchMock = vi.fn(async () => Response.json([{ result: 3 }, { result: 1 }]))
    vi.stubGlobal('fetch', fetchMock)

    const verdict = await consumeRateLimit('/api/auth/login', 'POST', headers())

    expect(verdict).toMatchObject({ allowed: true, count: 3, limit: 10 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    // The trailing slash on the configured URL must not produce a double slash.
    expect(url).toBe('https://example.upstash.io/pipeline')
    expect(JSON.parse(init.body as string)).toEqual([
      ['INCR', 'rl:/api/auth:203.0.113.7'],
      ['PEXPIRE', 'rl:/api/auth:203.0.113.7', '60000', 'NX'],
    ])
  })

  it('refuses once the count passes the limit', async () => {
    vi.stubGlobal('fetch', async () => Response.json([{ result: 11 }, { result: 0 }]))
    const verdict = await consumeRateLimit('/api/auth/login', 'POST', headers())
    expect(verdict?.allowed).toBe(false)
  })

  /**
   * FAILS OPEN, in agreement with checkRateLimit. An Upstash outage must not
   * be an outage of the login page; the Postgres limits on the server actions
   * are a separate system and still counting.
   */
  it('allows the request through when Upstash is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network')
    })
    expect(await consumeRateLimit('/api/auth/login', 'POST', headers())).toBeNull()
  })

  it('allows the request through on a non-200 or a junk body', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }))
    expect(await consumeRateLimit('/api/auth/login', 'POST', headers())).toBeNull()

    vi.stubGlobal('fetch', async () => Response.json([{ error: 'WRONGTYPE' }]))
    expect(await consumeRateLimit('/api/auth/login', 'POST', headers())).toBeNull()
  })
})
