import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Goal 9. Both search routes are unauthenticated and reachable by anyone, and
 * both were doing real query work per request with no ceiling: `/api/search`
 * runs an unindexed ILIKE over name_he + description_he, and
 * `/api/search/suggest` misses its cache on every distinct `q`.
 *
 * These tests pin the two properties that actually matter and that a future
 * refactor could quietly drop:
 *   - the gate is consulted, keyed per IP, and a refusal is a 429 with no
 *     query work behind it
 *   - the two-character floor is checked FIRST, so the empty-typeahead case
 *     never spends a limiter round-trip
 *
 * Verified to fail without the change: removing either rateLimit call turns
 * the 429 cases into 200s.
 *
 * `rateLimitHeaders` is NOT mocked, on purpose. A refusal that a client cannot
 * pace against is half a limiter, and these routes hand-rolled their 429 for
 * long enough that the header module had no callers at all; the assertions
 * below read the headers off the real builder so mocking cannot make them pass.
 */

const rateLimit = vi.fn()
const getClientIp = vi.fn()
const searchProductsCached = vi.fn()
const from = vi.fn()
const rpc = vi.fn()

/** What the limiter returns. `allowed` is the only field a caller branches on. */
function decision(allowed: boolean) {
  return {
    allowed,
    limit: 120,
    windowSeconds: 300,
    remaining: allowed ? 119 : 0,
    resetAtMs: Date.now() + 60_000,
    backend: 'upstash' as const,
  }
}

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  rateLimit: (...args: unknown[]) => rateLimit(...args),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  getClientIp: () => getClientIp(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from, rpc }),
}))
vi.mock('@/lib/search-server', () => ({
  searchProductsCached: (...args: unknown[]) => searchProductsCached(...args),
}))

const { GET: search } = await import('./route')
const { GET: suggest } = await import('./suggest/route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.7')
  rateLimit.mockResolvedValue(decision(true))
  searchProductsCached.mockResolvedValue({ results: [], engine: 'ilike' })
})

function req(path: string, q: string) {
  return new NextRequest(`https://kenyonexpress.co.il${path}?q=${encodeURIComponent(q)}`)
}

describe('/api/search rate limiting', () => {
  it('refuses with 429 and never touches the database when over the ceiling', async () => {
    rateLimit.mockResolvedValue(decision(false))

    const res = await search(req('/api/search', 'מקרר'))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited' })
    // The point of the gate: neither the FTS RPC nor the ILIKE ever runs.
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('keys the ceiling per client IP', async () => {
    rateLimit.mockResolvedValue(decision(false))

    await search(req('/api/search', 'מקרר'))

    expect(rateLimit).toHaveBeenCalledWith('search', '203.0.113.7')
  })

  it('does not spend a limiter round-trip below the two-character floor', async () => {
    const res = await search(req('/api/search', 'א'))

    expect(res.status).toBe(200)
    expect(rateLimit).not.toHaveBeenCalled()
  })
})

describe('/api/search/suggest rate limiting', () => {
  it('refuses with 429 and never reaches the search engine', async () => {
    rateLimit.mockResolvedValue(decision(false))

    const res = await suggest(req('/api/search/suggest', 'מקרר'))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited' })
    expect(searchProductsCached).not.toHaveBeenCalled()
  })

  it('uses a separate, higher ceiling from the results page', async () => {
    rateLimit.mockResolvedValue(decision(false))

    await suggest(req('/api/search/suggest', 'מקרר'))

    expect(rateLimit).toHaveBeenCalledWith('search-suggest', '203.0.113.7')
  })

  it('lets a normal query through to the engine', async () => {
    const res = await suggest(req('/api/search/suggest', 'מקרר'))

    expect(res.status).toBe(200)
    expect(searchProductsCached).toHaveBeenCalledWith('מקרר', 6)
  })

  it('does not spend a limiter round-trip below the two-character floor', async () => {
    const res = await suggest(req('/api/search/suggest', 'א'))

    expect(res.status).toBe(200)
    expect(rateLimit).not.toHaveBeenCalled()
  })
})

/**
 * WHAT A REFUSED CALLER IS TOLD, which is the half these routes were missing.
 *
 * `lib/rate-limit/headers.ts` was written to own the 429 shape and had ZERO
 * callers outside its own tests: every route hand-rolled `{ status: 429 }` and
 * sent no `Retry-After` at all. That is not a style point. `apps/mobile` is a
 * second caller of these routes, and with no header it cannot do better than
 * guess a backoff, which is exactly what the header module's own comment says
 * it exists to prevent.
 *
 * ONLY ON THE REFUSAL, and the reason is measured rather than conservative:
 * `/api/search` and `/api/search/facets` answer 200 with
 * `Cache-Control: public, s-maxage=30`, so a `RateLimit-Remaining` on a success
 * would be a per-caller counter inside a SHARED cache entry -- one client's
 * remaining budget served to everyone. A 429 is never cached.
 */
describe('the 429 a client can pace against', () => {
  it('sends Retry-After and the RateLimit trio on /api/search', async () => {
    rateLimit.mockResolvedValue(decision(false))

    const res = await search(req('/api/search', 'מקרר'))

    expect(res.status).toBe(429)
    expect(res.headers.get('RateLimit-Limit')).toBe('120')
    expect(res.headers.get('RateLimit-Remaining')).toBe('0')
    // A delta in seconds, never an epoch: a client that sleeps on an epoch
    // value sleeps for fifty-five thousand years.
    expect(Number(res.headers.get('RateLimit-Reset'))).toBeLessThanOrEqual(60)
    expect(res.headers.get('Retry-After')).toBe(res.headers.get('RateLimit-Reset'))
  })

  it('sends Retry-After on /api/search/suggest', async () => {
    rateLimit.mockResolvedValue(decision(false))

    const res = await suggest(req('/api/search/suggest', 'מקרר'))

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).not.toBeNull()
  })

  it('sends no RateLimit header on a cacheable 200, so a CDN cannot share one caller counter', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    const res = await search(req('/api/search', 'מקרר'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage')
    expect(res.headers.get('RateLimit-Limit')).toBeNull()
    expect(res.headers.get('RateLimit-Remaining')).toBeNull()
  })
})
