import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.hoisted(() => vi.fn())
const getClientIp = vi.hoisted(() => vi.fn(async () => '203.0.113.7'))

vi.mock('@/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')
  return { ...actual, rateLimit }
})
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp }))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { GET } from './route'

/**
 * The route's contract to the form: 400 for a query it cannot ask about, 429
 * with Retry-After when the IP has spent its window, and otherwise 200 with
 * either a validated 7-digit code or null. Null is never an error, because
 * the field it feeds is optional and a failed suggestion must not read as a
 * failed checkout.
 */

const ALLOWED = {
  allowed: true,
  limit: 30,
  windowSeconds: 600,
  remaining: 29,
  resetAtMs: null,
  backend: 'upstash' as const,
}

function request(query: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/checkout/postal-code')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return new NextRequest(url)
}

const FULL_QUERY = { city: 'תל אביב', street: 'דיזנגוף', house: '12' }

describe('GET /api/checkout/postal-code', () => {
  const originalFetch = globalThis.fetch
  const fetchMock = vi.fn()

  beforeEach(() => {
    rateLimit.mockReset().mockResolvedValue(ALLOWED)
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    vi.stubEnv(
      'ISRAEL_POST_ZIP_LOOKUP_URL',
      'https://zip.example.test/?c={city}&s={street}&h={house}',
    )
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('refuses a query missing a field with 400, before any rate-limit spend', async () => {
    const response = await GET(request({ city: 'תל אביב', street: 'דיזנגוף' }))
    expect(response.status).toBe(400)
    expect(rateLimit).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 429 with Retry-After when the IP is over its window', async () => {
    rateLimit.mockResolvedValue({
      ...ALLOWED,
      allowed: false,
      remaining: 0,
      resetAtMs: Date.now() + 30_000,
    })
    const response = await GET(request(FULL_QUERY))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(rateLimit).toHaveBeenCalledWith('postal-lookup', '203.0.113.7')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers null and calls nobody when no provider is configured', async () => {
    vi.stubEnv('ISRAEL_POST_ZIP_LOOKUP_URL', '')
    const response = await GET(request(FULL_QUERY))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ zip: null, configured: false })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('relays the encoded query and returns the validated code, cacheable', async () => {
    fetchMock.mockResolvedValue(new Response('{"zip":"6473424"}', { status: 200 }))
    const response = await GET(request(FULL_QUERY))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ zip: '6473424', configured: true })
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=86400')

    const calledWith = fetchMock.mock.calls[0]?.[0] as string
    expect(calledWith).toBe(
      'https://zip.example.test/?c=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91&s=%D7%93%D7%99%D7%96%D7%A0%D7%92%D7%95%D7%A3&h=12',
    )
  })

  it('answers null, uncached, when the provider is down or answers nonsense', async () => {
    fetchMock.mockResolvedValue(new Response('service unavailable', { status: 503 }))
    let response = await GET(request(FULL_QUERY))
    expect(await response.json()).toEqual({ zip: null, configured: true })
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    response = await GET(request(FULL_QUERY))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ zip: null, configured: true })

    fetchMock.mockResolvedValue(new Response('{"zip":"64734"}', { status: 200 }))
    response = await GET(request(FULL_QUERY))
    expect(await response.json()).toEqual({ zip: null, configured: true })
  })
})
