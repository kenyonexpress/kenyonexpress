import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { warn: () => {}, info: () => {}, error: () => {} },
}))

const bought = vi.fn()
const viewed = vi.fn()
const band = vi.fn()
const byIds = vi.fn()
vi.mock('./sources', () => ({
  loadBoughtTogetherRows: () => bought(),
  loadViewedTogetherRows: () => viewed(),
  loadPriceBandCandidates: (...args: unknown[]) => band(...args),
  loadProductsByIds: (...args: unknown[]) => byIds(...args),
}))

const { loadProductStrips, EMPTY_STRIPS } = await import('./product-strips')

const SEED = 'aaaaaaaa-0000-4000-8000-000000000000'
const P = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const card = (id: string, priceAgorot: number | null = 10_000) => ({
  id,
  slug: id,
  name_he: 'מוצר',
  kenyon_price: null,
  full_price: null,
  images: [],
  stock_quantity: 1,
  category: null,
  categoryId: null,
  priceAgorot,
})

beforeEach(() => {
  vi.clearAllMocks()
  bought.mockResolvedValue([])
  viewed.mockResolvedValue([])
  band.mockResolvedValue([])
  byIds.mockImplementation(async (ids: string[]) => ids.map((id) => card(id)))
})

describe('loadProductStrips', () => {
  it('ranks each behavioural strip from its own baskets and never repeats a card across strips', async () => {
    bought.mockResolvedValue([
      { key: 'o1', productId: SEED },
      { key: 'o1', productId: P(1) },
      { key: 'o2', productId: SEED },
      { key: 'o2', productId: P(1) },
      { key: 'o3', productId: SEED },
      { key: 'o3', productId: P(2) },
      { key: 'o4', productId: SEED },
      { key: 'o4', productId: P(2) },
    ])
    viewed.mockResolvedValue([
      { key: 's1', productId: SEED },
      { key: 's1', productId: P(1) },
      { key: 's2', productId: SEED },
      { key: 's2', productId: P(1) },
      { key: 's3', productId: SEED },
      { key: 's3', productId: P(3) },
      { key: 's4', productId: SEED },
      { key: 's4', productId: P(3) },
      { key: 's5', productId: SEED },
      { key: 's5', productId: P(4) },
      { key: 's6', productId: SEED },
      { key: 's6', productId: P(4) },
    ])
    band.mockResolvedValue([card(P(3), 10_100), card(P(5), 10_200), card(P(6), 10_900)])

    const strips = await loadProductStrips({ id: SEED, priceAgorot: 10_000 })

    expect(strips.boughtTogether.map((p) => p.id)).toEqual([P(1), P(2)])
    // P(1) is already in the bought strip, so viewed-together keeps P(3), P(4).
    expect(strips.viewedTogether.map((p) => p.id)).toEqual([P(3), P(4)])
    // P(3) is taken; the band ranks by distance to the seed price.
    expect(strips.similarPrice.map((p) => p.id)).toEqual([P(5), P(6)])
    expect(band).toHaveBeenCalledWith({ minAgorot: 7_500, maxAgorot: 12_500 }, SEED)
    // One card fetch for the union of both behavioural strips.
    expect(byIds).toHaveBeenCalledTimes(1)
    expect(byIds.mock.calls[0]?.[0]).toEqual([P(1), P(2), P(3), P(4)])
  })

  it('skips the price band entirely for a product without an integer price', async () => {
    const strips = await loadProductStrips({ id: SEED, priceAgorot: null })
    expect(strips).toEqual(EMPTY_STRIPS)
    expect(band).not.toHaveBeenCalled()
    expect(byIds).not.toHaveBeenCalled()
  })

  it('drops a pair seen once, and a strip that ends up with one card', async () => {
    bought.mockResolvedValue([
      { key: 'o1', productId: SEED },
      { key: 'o1', productId: P(1) },
    ])
    band.mockResolvedValue([card(P(2), 10_050)])
    const strips = await loadProductStrips({ id: SEED, priceAgorot: 10_000 })
    expect(strips.boughtTogether).toEqual([])
    expect(strips.similarPrice).toEqual([])
  })

  it('returns empty strips, not a throw, when a source throws', async () => {
    bought.mockRejectedValue(new Error('down'))
    expect(await loadProductStrips({ id: SEED, priceAgorot: 10_000 })).toEqual(EMPTY_STRIPS)
  })
})
