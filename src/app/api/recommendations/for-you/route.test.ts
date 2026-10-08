import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The route is a thin shell over `loadForYou`; what matters here is what it
 * refuses to do: serve over the ceiling, accept a distinct id from the query
 * string, pass an unbounded seed list on, or let a shared cache keep a
 * per-visitor body.
 */

const rateLimit = vi.fn()
const getClientIp = vi.fn()
const loadForYou = vi.fn()

function decision(allowed: boolean) {
  return {
    allowed,
    limit: 60,
    windowSeconds: 600,
    remaining: allowed ? 59 : 0,
    resetAtMs: Date.now() + 60_000,
    backend: 'upstash' as const,
  }
}

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  rateLimit: (...args: unknown[]) => rateLimit(...args),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ getClientIp: () => getClientIp() }))
vi.mock('@/lib/recommendations/for-you', () => ({
  loadForYou: (...args: unknown[]) => loadForYou(...args),
}))

const { GET } = await import('./route')

const A = '11111111-1111-4111-8111-111111111111'

function req(query = '', cookie?: string) {
  return new NextRequest(`https://kenyonexpress.co.il/api/recommendations/for-you${query}`, {
    headers: cookie ? { cookie } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.7')
  rateLimit.mockResolvedValue(decision(true))
  loadForYou.mockResolvedValue([])
})

describe('GET /api/recommendations/for-you', () => {
  it('refuses with 429 and never loads when over the ceiling', async () => {
    rateLimit.mockResolvedValue(decision(false))
    const res = await GET(req())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(rateLimit).toHaveBeenCalledWith('recommendations', '203.0.113.7')
    expect(loadForYou).not.toHaveBeenCalled()
  })

  it('takes the distinct id from the ke_ph_id cookie, not from the query, and the seeds from ?seed=', async () => {
    await GET(req(`?seed=${A},junk&distinct_id=someone-else`, 'ke_ph_id=visitor-1; other=x'))
    expect(loadForYou).toHaveBeenCalledWith({ distinctId: 'visitor-1', seedIds: [A, 'junk'] })

    await GET(req(''))
    expect(loadForYou).toHaveBeenLastCalledWith({ distinctId: null, seedIds: [] })

    await GET(req('', `ke_ph_id=${'x'.repeat(129)}`))
    expect(loadForYou).toHaveBeenLastCalledWith({ distinctId: null, seedIds: [] })
  })

  it('rejects an over-long seed list before loading anything', async () => {
    const flood = Array.from({ length: 25 }, (_, i) => `s${i}`).join(',')
    const res = await GET(req(`?seed=${flood}`))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'too_many_seeds' })
    expect(loadForYou).not.toHaveBeenCalled()
  })

  it('returns card fields only, privately cached', async () => {
    loadForYou.mockResolvedValue([
      {
        id: A,
        slug: 'deal',
        name_he: 'דיל',
        kenyon_price: 99,
        full_price: 150,
        images: ['/a.webp'],
        stock_quantity: 4,
        category: { name_he: 'קטגוריה', slug: 'cat' },
        categoryId: 'cat-1',
        priceAgorot: 9_900,
      },
    ])
    const res = await GET(req(`?seed=${A}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await res.json()) as { products: Record<string, unknown>[] }
    expect(body.products).toHaveLength(1)
    expect(Object.keys(body.products[0] ?? {}).sort()).toEqual(
      [
        'category',
        'full_price',
        'id',
        'images',
        'kenyon_price',
        'name_he',
        'slug',
        'stock_quantity',
      ].sort(),
    )
  })
})
