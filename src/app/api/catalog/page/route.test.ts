import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The JSON page route behind the grid's continuous mode (UX22). Pinned: the
 * route calls the SAME cached readers as the pages with the SAME parsed
 * arguments (a page the shopper scrolls into is the page the link opens),
 * tells the two archives apart by `slug`, answers 404 for a slug no active
 * category has, refuses over the limit before any read, and carries the
 * archive's edge TTL.
 */

const rateLimit = vi.fn()
const getClientIp = vi.fn()
const getCategoryBySlug = vi.fn()
const getCategoryProductsCached = vi.fn()
const getShopProductsCached = vi.fn()

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
vi.mock('@/lib/category-page', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/category-page')>()),
  getCategoryBySlug: (...args: unknown[]) => getCategoryBySlug(...args),
  getCategoryProductsCached: (...args: unknown[]) => getCategoryProductsCached(...args),
  getShopProductsCached: (...args: unknown[]) => getShopProductsCached(...args),
}))
vi.mock('@/lib/pricing/price-history-read', () => ({
  attachPriceHistory: async (items: { id: string }[]) =>
    items.map((item) => ({ ...item, priceHistory: null })),
}))

const { GET } = await import('./route')

function product(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    slug: `p-${id}`,
    name_he: `מוצר ${id}`,
    kenyon_price: 10,
    full_price: 20,
    images: [],
    stock_quantity: 5,
    created_at: '2026-01-01',
    type: 'voucher',
    categories: [],
    supplier: null,
    ...extra,
  }
}

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/catalog/page${query}`))
}

describe('GET /api/catalog/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClientIp.mockResolvedValue('203.0.113.9')
    rateLimit.mockResolvedValue(decision(true))
    getShopProductsCached.mockResolvedValue({ items: [product('a'), product('b')], total: 46 })
    getCategoryProductsCached.mockResolvedValue({ items: [product('c')], total: 30 })
    getCategoryBySlug.mockResolvedValue({
      id: 'cat-1',
      slug: 'hot-deals',
      name_he: 'מבצעים חמים',
      description_he: null,
      parent_id: null,
    })
  })

  it('serves the shop archive with the parsed page, sort and bounds when there is no slug', async () => {
    const res = await get('?page=2&sort=price_asc&min=10&max=99&type=coupon')
    expect(res.status).toBe(200)
    expect(getShopProductsCached).toHaveBeenCalledWith({
      sort: 'price_asc',
      page: 2,
      priceMin: 10,
      priceMax: 99,
      productType: 'coupon',
    })
    expect(getCategoryProductsCached).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body).toMatchObject({ total: 46, page: 2, totalPages: 2, pageSize: 24 })
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({ id: 'a', priceHistory: null })
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    )
  })

  it('serves a category with the collection rule and every category facet', async () => {
    const res = await get('?slug=hot-deals&page=3&city=haifa&brand=Acme&discount=30')
    expect(res.status).toBe(200)
    expect(getCategoryBySlug).toHaveBeenCalledWith('hot-deals')
    expect(getCategoryProductsCached).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 'cat-1',
        category: { name_he: 'מבצעים חמים', slug: 'hot-deals' },
        sort: 'menu_order',
        page: 3,
        city: 'haifa',
        brand: 'Acme',
        minDiscount: 30,
        collection: expect.anything(),
      }),
    )
    expect(getShopProductsCached).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body).toMatchObject({ total: 30, page: 3, totalPages: 2, pageSize: 24 })
  })

  it('answers 404 for a slug no active category has, without reading products', async () => {
    getCategoryBySlug.mockResolvedValue(null)
    const res = await get('?slug=no-such&page=2')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'unknown_category', items: [] })
    expect(getCategoryProductsCached).not.toHaveBeenCalled()
  })

  it('refuses over the limit with 429 and the pacing headers, before any read', async () => {
    rateLimit.mockResolvedValue(decision(false))
    const res = await get('?page=2')
    expect(res.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith('catalog-page', '203.0.113.9')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(getShopProductsCached).not.toHaveBeenCalled()
    expect(getCategoryProductsCached).not.toHaveBeenCalled()
  })

  it('falls back to page 1 and the default sort for junk, like the page does', async () => {
    const res = await get('?page=zero&sort=weird&min=-5')
    expect(res.status).toBe(200)
    expect(getShopProductsCached).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, sort: 'menu_order', priceMin: undefined }),
    )
  })

  it('orders nearest-first when the URL carries near, after the read', async () => {
    getShopProductsCached.mockResolvedValue({
      items: [
        product('far', { supplier: { city: 'חיפה', latitude: 32.79, longitude: 34.99 } }),
        product('close', { supplier: { city: 'תל אביב', latitude: 32.08, longitude: 34.78 } }),
      ],
      total: 2,
    })
    const res = await get('?page=1&near=32.08,34.78')
    const body = await res.json()
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(['close', 'far'])
  })
})
