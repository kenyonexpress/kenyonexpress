import { CacheControl } from '@/lib/cache/http'
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
 * The route's contract to the street field (UX17): 400 for a query it cannot
 * ask about, 429 with Retry-After when the IP has spent its window, and
 * otherwise 200 with a ranked, capped list of street names - empty when the
 * lookup is off, slow, or knows nothing. Empty is never an error, because the
 * field it feeds accepts anything typed.
 */

const ALLOWED = {
  allowed: true,
  limit: 60,
  windowSeconds: 600,
  remaining: 59,
  resetAtMs: null,
  backend: 'upstash' as const,
}

function request(query: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/checkout/streets')
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return new NextRequest(url)
}

const REGISTRY_ANSWER = JSON.stringify({
  success: true,
  result: {
    records: [
      { שם_ישוב: 'תל אביב - יפו', שם_רחוב: 'ככר דיזנגוף' },
      { שם_ישוב: 'תל אביב - יפו', שם_רחוב: 'דיזנגוף' },
      { שם_ישוב: 'באר יעקב', שם_רחוב: 'דיזנגוף' },
    ],
  },
})

describe('GET /api/checkout/streets', () => {
  const originalFetch = globalThis.fetch
  const fetchMock = vi.fn()

  beforeEach(() => {
    rateLimit.mockReset().mockResolvedValue(ALLOWED)
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    vi.stubEnv('ISRAEL_STREETS_LOOKUP_URL', 'https://streets.example.test/?ts={tsquery}')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('refuses a query without a city or with one letter with 400, before any spend', async () => {
    expect((await GET(request({ q: 'דיז' }))).status).toBe(400)
    expect((await GET(request({ city: 'תל אביב', q: 'ד' }))).status).toBe(400)
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
    const response = await GET(request({ city: 'תל אביב', q: 'דיז' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(await response.json()).toMatchObject({ streets: [], error: 'rate_limited' })
    expect(rateLimit).toHaveBeenCalledWith('street-lookup', '203.0.113.7')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks the configured provider with the ANDed prefix query and ranks the answer', async () => {
    fetchMock.mockResolvedValue(new Response(REGISTRY_ANSWER, { status: 200 }))
    const response = await GET(request({ city: 'תל אביב', q: 'דיז' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      streets: ['דיזנגוף', 'ככר דיזנגוף'],
      configured: true,
    })
    expect(response.headers.get('Cache-Control')).toBe(CacheControl.streets)
    const askedUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(askedUrl).toBe(
      `https://streets.example.test/?ts=${encodeURIComponent('תל & אביב & דיז:*')}`,
    )
  })

  it('answers an empty, uncached list when the lookup is switched off', async () => {
    vi.stubEnv('ISRAEL_STREETS_LOOKUP_URL', 'off')
    const response = await GET(request({ city: 'תל אביב', q: 'דיז' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ streets: [], configured: false })
    expect(response.headers.get('Cache-Control')).toBe(CacheControl.private)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers an empty, uncached list when the provider fails, times out, or answers HTML', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }))
    let response = await GET(request({ city: 'תל אביב', q: 'דיז' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ streets: [], configured: true })
    expect(response.headers.get('Cache-Control')).toBe(CacheControl.private)

    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    response = await GET(request({ city: 'תל אביב', q: 'דיז' }))
    expect(await response.json()).toEqual({ streets: [], configured: true })

    fetchMock.mockResolvedValueOnce(new Response('<!DOCTYPE html>שגיאה', { status: 200 }))
    response = await GET(request({ city: 'תל אביב', q: 'דיז' }))
    // Parsed to nothing: a 200 with an empty list, cacheable like any other
    // "this city has no such street".
    expect(await response.json()).toEqual({ streets: [], configured: true })
  })
})
