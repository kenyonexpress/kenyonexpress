import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rateLimitMock, getShopProductsMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn(),
  getShopProductsMock: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  rateLimitHeaders: () => new Headers({ 'Retry-After': '30' }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  getClientIp: async () => '203.0.113.5',
}))

vi.mock('@/lib/category-page', () => ({
  getShopProducts: (...args: unknown[]) => getShopProductsMock(...args),
}))

const { GET } = await import('./route')

function get(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest
}

const row = {
  id: 'p1',
  slug: 'deal',
  name_he: 'דיל',
  kenyon_price: 40,
  full_price: 80,
  images: ['/images/products/a.webp'],
  stock_quantity: 3,
  categories: { name_he: 'אוכל', slug: 'food' },
}

beforeEach(() => {
  rateLimitMock.mockReset().mockResolvedValue({
    allowed: true,
    limit: 120,
    windowSeconds: 300,
    remaining: 119,
    resetAtMs: null,
    backend: 'open',
  })
  getShopProductsMock.mockReset().mockResolvedValue({ items: [row], total: 45 })
})

describe('GET /api/products', () => {
  it('returns a page of 20 in the asked sort, with the public cache header', async () => {
    const res = await GET(
      get('https://kenyonexpress.co.il/api/products?sort=price_asc&page=2&limit=20'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toMatch(/^public,/)
    expect(rateLimitMock).toHaveBeenCalledWith('products-list', '203.0.113.5')
    expect(getShopProductsMock).toHaveBeenCalledWith({
      sort: 'price_asc',
      page: 2,
      pageSize: 20,
      priceMin: undefined,
      priceMax: undefined,
      productType: undefined,
    })
    await expect(res.json()).resolves.toEqual({
      products: [
        {
          id: 'p1',
          slug: 'deal',
          name_he: 'דיל',
          kenyon_price: 40,
          full_price: 80,
          images: ['/images/products/a.webp'],
          stock_quantity: 3,
          categories: [{ name_he: 'אוכל', slug: 'food' }],
        },
      ],
      page: 2,
      limit: 20,
      total_count: 45,
      has_more: true,
    })
  })

  it('passes the shop filters through and caps an oversized limit', async () => {
    await GET(
      get(
        'https://kenyonexpress.co.il/api/products?sort=newest&page=1&limit=500&min=0&max=100000&type=physical',
      ),
    )
    expect(getShopProductsMock).toHaveBeenCalledWith({
      sort: 'newest',
      page: 1,
      pageSize: 20,
      priceMin: 0,
      priceMax: 100000,
      productType: 'physical',
    })
  })

  it('refuses with 429 and does not read the catalogue', async () => {
    rateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 120,
      windowSeconds: 300,
      remaining: 0,
      resetAtMs: null,
      backend: 'open',
    })
    const res = await GET(get('https://kenyonexpress.co.il/api/products?sort=price_desc'))
    expect(res.status).toBe(429)
    expect(getShopProductsMock).not.toHaveBeenCalled()
    expect(res.headers.get('Cache-Control')).toBeNull()
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited', products: [] })
  })

  it('answers with a code when the catalogue read throws', async () => {
    getShopProductsMock.mockRejectedValue(new Error('relation products does not exist'))
    const res = await GET(get('https://kenyonexpress.co.il/api/products'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('products_failed')
    expect(JSON.stringify(body)).not.toContain('does not exist')
  })
})
