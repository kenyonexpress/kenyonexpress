import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Client islands inside ProductCard need providers the strip does not.
vi.mock('@/components/cart/AddToCartButton', () => ({ default: () => null }))
vi.mock('@/components/product/WishlistButton', () => ({ default: () => null }))
vi.mock('@/components/compare/CompareButton', () => ({ default: () => null }))

const strips = vi.fn()
vi.mock('@/lib/recommendations/product-strips', () => ({
  loadProductStrips: (...args: unknown[]) => strips(...args),
}))
const related = vi.fn()
vi.mock('@/lib/related-products', () => ({
  loadRelatedProducts: (...args: unknown[]) => related(...args),
}))

const { default: ProductRecommendations, STRIP_TITLES } = await import('./ProductRecommendations')

const card = (id: string) => ({
  id,
  slug: id,
  name_he: `מוצר ${id}`,
  kenyon_price: 100,
  full_price: 150,
  images: [],
  stock_quantity: 2,
  category: null,
  categoryId: null,
  priceAgorot: 10_000,
})

function stripsOf(html: string): string[] {
  return [...html.matchAll(/data-strip="([a-zA-Z]+)"/g)].map((m) => m[1] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  strips.mockResolvedValue({ boughtTogether: [], viewedTogether: [], similarPrice: [] })
  related.mockResolvedValue([])
})

describe('ProductRecommendations', () => {
  it('renders the behavioural strips in signal order, then the price strip, and no fallback', async () => {
    strips.mockResolvedValue({
      boughtTogether: [card('b1'), card('b2')],
      viewedTogether: [card('v1'), card('v2')],
      similarPrice: [card('s1'), card('s2')],
    })
    const html = renderToStaticMarkup(
      await ProductRecommendations({ productId: 'seed', categoryId: 'cat', priceAgorot: 10_000 }),
    )
    expect(stripsOf(html)).toEqual(['boughtTogether', 'viewedTogether', 'similarPrice'])
    expect(html).toContain(STRIP_TITLES.boughtTogether)
    expect(html).toContain(STRIP_TITLES.viewedTogether)
    expect(html).toContain(STRIP_TITLES.similarPrice)
    expect(related).not.toHaveBeenCalled()
    expect(strips).toHaveBeenCalledWith({ id: 'seed', priceAgorot: 10_000 })
  })

  it('falls back to the same-category "מומלצים" when neither behavioural strip has support, and dedupes the price strip against it', async () => {
    strips.mockResolvedValue({
      boughtTogether: [],
      viewedTogether: [],
      similarPrice: [card('r1'), card('s1'), card('s2')],
    })
    related.mockResolvedValue([card('r1'), card('r2')])
    const html = renderToStaticMarkup(
      await ProductRecommendations({ productId: 'seed', categoryId: 'cat', priceAgorot: 10_000 }),
    )
    expect(stripsOf(html)).toEqual(['related', 'similarPrice'])
    expect(html).toContain(STRIP_TITLES.related)
    expect(html.match(/מוצר r1/g)).toHaveLength(1)
    expect(related).toHaveBeenCalledWith('cat', 'seed')
  })

  it('drops the price strip when dedupe leaves it under the floor', async () => {
    strips.mockResolvedValue({
      boughtTogether: [],
      viewedTogether: [],
      similarPrice: [card('r1'), card('s1')],
    })
    related.mockResolvedValue([card('r1'), card('r2')])
    const html = renderToStaticMarkup(
      await ProductRecommendations({ productId: 'seed', categoryId: 'cat', priceAgorot: 10_000 }),
    )
    expect(stripsOf(html)).toEqual(['related'])
  })

  it('renders nothing at all when there is nothing to show', async () => {
    const out = await ProductRecommendations({
      productId: 'seed',
      categoryId: null,
      priceAgorot: null,
    })
    expect(out).toBeNull()
  })
})
