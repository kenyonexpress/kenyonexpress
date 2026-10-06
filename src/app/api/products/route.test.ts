import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rateLimit = vi.fn()
const getClientIp = vi.fn()
const getShopProducts = vi.fn()
const attachRatings = vi.fn()

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
vi.mock('@/lib/category-page', () => ({
  getShopProducts: (...args: unknown[]) => getShopProducts(...args),
}))
vi.mock('@/server/queries/reviews', () => ({
  attachRatings: (...args: unknown[]) => attachRatings(...args),
}))

const { GET } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.9')
  rateLimit.mockResolvedValue(decision(true))
  getShopProducts.mockResolvedValue({ items: [{ id: 'p1', slug: 'a', name_he: 'א' }], total: 44 })
  attachRatings.mockImplementation(async (items: unknown[]) => items)
})

function req(qs: string) {
  return new NextRequest(`https://kenyonexpress.co.il/api/products?${qs}`)
}

describe('GET /api/products', () => {
  it('refuses with 429 and never reads the catalogue when over the ceiling', async () => {
    rateLimit.mockResolvedValue(decision(false))
    const res = await GET(req('sort=price_asc&page=2&limit=20'))
    expect(res.status).toBe(429)
    expect(getShopProducts).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited', products: [] })
  })

  it('returns page 2 with has_more when 44 products exist', async () => {
    const res = await GET(req('sort=newest&page=2&limit=20'))
    expect(res.status).toBe(200)
    expect(getShopProducts).toHaveBeenCalledWith({
      sort: 'newest',
      page: 2,
      limit: 20,
      priceMin: undefined,
      priceMax: undefined,
      productType: undefined,
    })
    await expect(res.json()).resolves.toMatchObject({
      page: 2,
      limit: 20,
      total_count: 44,
      has_more: true,
    })
  })

  it('sets has_more false on the last page', async () => {
    const res = await GET(req('sort=price_desc&page=3&limit=20'))
    await expect(res.json()).resolves.toMatchObject({ has_more: false, total_count: 44 })
  })
})
