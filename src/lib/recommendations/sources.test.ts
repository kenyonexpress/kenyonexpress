import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The readers are one query each; what these tests pin is the SHAPE each one
 * hands to `rules.ts` and the order of sources: PostHog when it answers,
 * first-party `analytics_events` when it does not, and an empty list (never
 * a throw) on every failure.
 */

vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...args: unknown[]) => warn(...args), info: () => {}, error: () => {} },
}))

type Result = { data: unknown[] | null; error: { message: string } | null }

const admin = { tables: [] as string[], filters: [] as unknown[][], result: {} as Result }
const catalogue = { filters: [] as unknown[][], result: {} as Result }

function chain(target: { filters: unknown[][]; result: Result }) {
  const c: Record<string, (...args: unknown[]) => unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'not', 'gte', 'lte', 'in', 'order']) {
    c[m] = (...args: unknown[]) => {
      target.filters.push([m, ...args])
      return c
    }
  }
  c.limit = (...args: unknown[]) => {
    target.filters.push(['limit', ...args])
    return Promise.resolve(target.result)
  }
  // `.in()` is terminal for loadProductsByIds.
  c.in = (...args: unknown[]) => {
    target.filters.push(['in', ...args])
    return Promise.resolve(target.result)
  }
  return c
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      admin.tables.push(table)
      return chain(admin)
    },
  }),
}))
vi.mock('@/lib/supabase/read-replica', () => ({
  createCatalogueReadClient: () => ({ from: () => chain(catalogue) }),
}))

const configured = vi.fn(() => false)
const hogql = vi.fn()
vi.mock('./posthog-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./posthog-query')>()),
  isPostHogQueryConfigured: () => configured(),
  queryHogql: (...args: unknown[]) => hogql(...args),
}))

const {
  loadBoughtTogetherRows,
  loadPriceBandCandidates,
  loadProductsByIds,
  loadViewedTogetherRows,
  loadVisitorHistory,
} = await import('./sources')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  admin.tables = []
  admin.filters = []
  admin.result = { data: [], error: null }
  catalogue.filters = []
  catalogue.result = { data: [], error: null }
  configured.mockReturnValue(false)
})

describe('loadViewedTogetherRows', () => {
  it('reads PostHog baskets when it is configured and answers', async () => {
    configured.mockReturnValue(true)
    hogql.mockResolvedValue({
      columns: ['basket', 'item_id'],
      results: [
        ['v1:2026-10-08', A],
        ['v1:2026-10-08', B],
      ],
    })
    expect(await loadViewedTogetherRows()).toEqual([
      { key: 'v1:2026-10-08', productId: A },
      { key: 'v1:2026-10-08', productId: B },
    ])
    expect(admin.tables).toEqual([])
    expect(hogql.mock.calls[0]?.[1]).toEqual({ days: 90 })
  })

  it('falls back to first-party view_product sessions when PostHog is unconfigured or fails', async () => {
    admin.result = {
      data: [
        { session_id: 's1', props: { product_id: A } },
        { session_id: 's1', props: { product_id: B } },
        { session_id: 's2', props: {} },
        { session_id: '', props: { product_id: A } },
      ],
      error: null,
    }
    expect(await loadViewedTogetherRows()).toEqual([
      { key: 's1', productId: A },
      { key: 's1', productId: B },
    ])
    expect(admin.tables).toEqual(['analytics_events'])
    expect(admin.filters).toContainEqual(['eq', 'event_name', 'view_product'])

    admin.tables = []
    configured.mockReturnValue(true)
    hogql.mockResolvedValue(null)
    await loadViewedTogetherRows()
    expect(admin.tables).toEqual(['analytics_events'])
  })

  it('is empty and logged on a database error', async () => {
    admin.result = { data: null, error: { message: 'permission denied' } }
    expect(await loadViewedTogetherRows()).toEqual([])
    expect(warn).toHaveBeenCalledWith('recommendations.first_party_views_failed', {
      reason: 'permission denied',
    })
  })
})

describe('loadBoughtTogetherRows', () => {
  it('keys baskets by order and filters to paid orders through the inner join', async () => {
    admin.result = {
      data: [
        { order_id: 'o1', product_id: A, orders: { paid_at: '2026-10-01' } },
        { order_id: 'o1', product_id: B, orders: { paid_at: '2026-10-01' } },
        { order_id: 'o2', product_id: null, orders: { paid_at: '2026-10-01' } },
      ],
      error: null,
    }
    expect(await loadBoughtTogetherRows()).toEqual([
      { key: 'o1', productId: A },
      { key: 'o1', productId: B },
    ])
    expect(admin.tables).toEqual(['order_items'])
    expect(admin.filters[0]?.[1]).toContain('orders!inner(paid_at)')
    expect(admin.filters).toContainEqual(['not', 'orders.paid_at', 'is', null])
    expect(admin.filters).toContainEqual(['is', 'deleted_at', null])
  })

  it('is empty when the admin client cannot be built', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const spy = vi.mocked(createAdminClient)
    void spy
    admin.result = { data: null, error: { message: 'no key' } }
    expect(await loadBoughtTogetherRows()).toEqual([])
  })
})

describe('loadPriceBandCandidates and loadProductsByIds', () => {
  const row = (id: string, agorot: number | null) => ({
    id,
    slug: `s-${id.slice(0, 2)}`,
    name_he: 'מוצר',
    kenyon_price: agorot === null ? null : agorot / 100,
    full_price: null,
    kenyon_price_agorot: agorot,
    images: [],
    stock_quantity: 3,
    category_id: 'cat-1',
    categories: [{ name_he: 'קטגוריה', slug: 'cat' }],
  })

  it('queries the band on the integer column and maps rows to cards with their agorot', async () => {
    catalogue.result = { data: [row(A, 30_000), row(B, null)], error: null }
    const cards = await loadPriceBandCandidates({ minAgorot: 30_000, maxAgorot: 50_000 }, 'seed')
    expect(catalogue.filters).toContainEqual(['gte', 'kenyon_price_agorot', 30_000])
    expect(catalogue.filters).toContainEqual(['lte', 'kenyon_price_agorot', 50_000])
    expect(catalogue.filters).toContainEqual(['neq', 'id', 'seed'])
    expect(cards.map((c) => [c.id, c.priceAgorot, c.categoryId, c.category?.slug])).toEqual([
      [A, 30_000, 'cat-1', 'cat'],
      [B, null, 'cat-1', 'cat'],
    ])
  })

  it('returns cards in the order asked for, skipping ids that did not come back or are not UUIDs', async () => {
    catalogue.result = { data: [row(A, 1_000), row(B, 2_000)], error: null }
    const cards = await loadProductsByIds([B, 'junk', A, 'c0ffee00-0000-4000-8000-000000000000'])
    expect(cards.map((c) => c.id)).toEqual([B, A])
    expect(catalogue.filters).toContainEqual([
      'in',
      'id',
      [B, A, 'c0ffee00-0000-4000-8000-000000000000'],
    ])
  })

  it('does not query for an empty or all-junk id list', async () => {
    expect(await loadProductsByIds(['nope'])).toEqual([])
    expect(catalogue.filters).toEqual([])
  })
})

describe('loadVisitorHistory', () => {
  it('is empty without PostHog, and otherwise binds the id and keeps only UUIDs', async () => {
    expect(await loadVisitorHistory('v1')).toEqual([])
    expect(hogql).not.toHaveBeenCalled()

    configured.mockReturnValue(true)
    hogql.mockResolvedValue({
      columns: ['item_id', 'last_seen'],
      results: [
        [A, 't'],
        ['x', 't'],
      ],
    })
    expect(await loadVisitorHistory('v1')).toEqual([A])
    expect(hogql.mock.calls[0]?.[1]).toEqual({ distinct_id: 'v1', days: 30, limit: 12 })
  })
})
