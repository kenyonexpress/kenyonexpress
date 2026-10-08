import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { warn: () => {}, info: () => {}, error: () => {} },
}))

const history = vi.fn()
const viewed = vi.fn()
const bought = vi.fn()
const byIds = vi.fn()
vi.mock('./sources', () => ({
  loadVisitorHistory: (...args: unknown[]) => history(...args),
  loadViewedTogetherRows: () => viewed(),
  loadBoughtTogetherRows: () => bought(),
  loadProductsByIds: (...args: unknown[]) => byIds(...args),
}))

const related = vi.fn()
vi.mock('@/lib/related-products', () => ({
  loadRelatedProducts: (...args: unknown[]) => related(...args),
}))

const { loadForYou } = await import('./for-you')

const P = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const card = (id: string, categoryId: string | null = 'cat-1') => ({
  id,
  slug: id,
  name_he: 'מוצר',
  kenyon_price: null,
  full_price: null,
  images: [],
  stock_quantity: 1,
  category: null,
  categoryId,
  priceAgorot: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  history.mockResolvedValue([])
  viewed.mockResolvedValue([])
  bought.mockResolvedValue([])
  related.mockResolvedValue([])
  byIds.mockImplementation(async (ids: string[]) => ids.map((id) => card(id)))
})

describe('loadForYou', () => {
  it('does nothing for a visitor with no history from either source', async () => {
    expect(await loadForYou({ distinctId: 'v1', seedIds: ['not-a-uuid'] })).toEqual([])
    expect(history).toHaveBeenCalledWith('v1')
    expect(viewed).not.toHaveBeenCalled()
    expect(byIds).not.toHaveBeenCalled()
  })

  it('skips PostHog without a distinct id and still works from the browser seeds', async () => {
    related.mockResolvedValue([card(P(8)), card(P(9))])
    const picks = await loadForYou({ distinctId: null, seedIds: [P(1)] })
    expect(history).not.toHaveBeenCalled()
    expect(picks.map((p) => p.id)).toEqual([P(8), P(9)])
  })

  it('merges PostHog history with the seeds, ranks co-occurring products, and never returns a seed', async () => {
    history.mockResolvedValue([P(1)])
    viewed.mockResolvedValue([
      { key: 'a', productId: P(1) },
      { key: 'a', productId: P(3) },
      { key: 'b', productId: P(1) },
      { key: 'b', productId: P(3) },
      { key: 'c', productId: P(2) },
      { key: 'c', productId: P(3) },
      { key: 'd', productId: P(2) },
      { key: 'd', productId: P(3) },
      { key: 'e', productId: P(2) },
      { key: 'e', productId: P(4) },
      { key: 'f', productId: P(2) },
      { key: 'f', productId: P(4) },
      // The visitor already saw P(2); it must not be recommended back.
      { key: 'g', productId: P(1) },
      { key: 'g', productId: P(2) },
      { key: 'h', productId: P(1) },
      { key: 'h', productId: P(2) },
    ])
    const picks = await loadForYou({ distinctId: 'v1', seedIds: [P(2)] })
    expect(picks.map((p) => p.id)).toEqual([P(3), P(4)])
    // Seeds were fetched once (for their categories), picks once.
    expect(byIds.mock.calls[0]?.[0]).toEqual([P(1), P(2)])
    expect(byIds.mock.calls[1]?.[0]).toEqual([P(3), P(4)])
  })

  it('fills from the browsed categories, once per category, excluding what was viewed', async () => {
    byIds.mockImplementation(async (ids: string[]) =>
      ids.map((id) => card(id, id === P(1) ? 'cat-1' : 'cat-2')),
    )
    related.mockImplementation(async (categoryId: string) =>
      categoryId === 'cat-1' ? [card(P(1)), card(P(5)), card(P(6))] : [card(P(7))],
    )
    const picks = await loadForYou({ distinctId: null, seedIds: [P(1), P(2), P(3)] })
    expect(picks.map((p) => p.id)).toEqual([P(5), P(6), P(7)])
    // cat-2 appears for two seeds and is asked once.
    expect(related).toHaveBeenCalledTimes(2)
    expect(related).toHaveBeenCalledWith('cat-1', P(1))
    expect(related).toHaveBeenCalledWith('cat-2', P(2))
  })

  it('is empty under the strip floor and on a thrown source', async () => {
    related.mockResolvedValue([card(P(5))])
    expect(await loadForYou({ distinctId: null, seedIds: [P(1)] })).toEqual([])
    viewed.mockRejectedValue(new Error('down'))
    expect(await loadForYou({ distinctId: null, seedIds: [P(1)] })).toEqual([])
  })
})
