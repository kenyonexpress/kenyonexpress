import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `getRatingSummaries` has two sources for the same number and must prefer the
 * right one.
 *
 * THE CACHE IS NOT A SPEED CHOICE HERE. The fold it replaces has no `.limit()`,
 * so past PostgREST's row ceiling it averages whichever approved rows came
 * back: a number that keeps one decimal place, looks precise, and is wrong
 * with nothing raising. These tests pin (a) that the cache wins when it exists,
 * (b) that 42703 - which is 221 unapplied, the state today - falls all the way
 * back to the fold rather than returning an empty map, and (c) that the two
 * paths agree on the contract that keeps unrated products from showing zero
 * stars.
 */

type Result = { data: unknown; error: { code?: string; message?: string } | null }

let productsResult: Result = { data: [], error: null }
let reviewsResult: Result = { data: [], error: null }
const tablesRead: string[] = []

vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => ({
    from(table: string) {
      tablesRead.push(table)
      const result = table === 'products' ? () => productsResult : () => reviewsResult
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'in', 'eq', 'order', 'limit']) {
        chain[method] = () => chain
      }
      // Awaiting the builder is what performs the read, so the mock has to be a
      // thenable: that is precisely what PostgrestFilterBuilder is. The two call
      // sites under test end their chains at different lengths (`.in()` for the
      // products cache, `.in().eq()` for the reviews fold), so a mock that
      // resolved at one fixed method could only exercise one of them.
      // biome-ignore lint/suspicious/noThenProperty: mirrors the real client, which is a thenable builder
      chain.then = (resolve: (v: Result) => unknown) => Promise.resolve(result()).then(resolve)
      return chain
    },
  }),
}))

vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => warn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { getRatingSummaries } = await import('./reviews')

beforeEach(() => {
  productsResult = { data: [], error: null }
  reviewsResult = { data: [], error: null }
  tablesRead.length = 0
  warn.mockClear()
})

const UNDEFINED_COLUMN = { code: '42703', message: 'column products.rating_sum does not exist' }

describe('getRatingSummaries', () => {
  it('uses the cached counters and never reads reviews at all', async () => {
    productsResult = {
      data: [{ id: 'p1', rating_sum: 22, rating_count: 5 }],
      error: null,
    }
    const out = await getRatingSummaries(['p1'])
    expect(out.get('p1')).toEqual({ count: 5, average: 4.4 })
    expect(tablesRead).toEqual(['products'])
  })

  it('rounds the derived average to one place, like the fold it replaces', async () => {
    // 14/3 = 4.666..., which must present as 4.7 and not 4.666666666666667.
    productsResult = { data: [{ id: 'p1', rating_sum: 14, rating_count: 3 }], error: null }
    const out = await getRatingSummaries(['p1'])
    expect(out.get('p1')?.average).toBe(4.7)
  })

  it('omits a product with no approved reviews rather than reporting zero', async () => {
    // A zero here would paint a fabricated score of zero stars on an unrated
    // product, which is worse than painting nothing.
    productsResult = { data: [{ id: 'p1', rating_sum: 0, rating_count: 0 }], error: null }
    const out = await getRatingSummaries(['p1'])
    expect(out.has('p1')).toBe(false)
  })

  it('falls back to folding reviews when 221 is unapplied, and does not warn about it', async () => {
    productsResult = { data: null, error: UNDEFINED_COLUMN }
    reviewsResult = {
      data: [
        { product_id: 'p1', rating: 5 },
        { product_id: 'p1', rating: 4 },
      ],
      error: null,
    }
    const out = await getRatingSummaries(['p1'])
    expect(out.get('p1')).toEqual({ count: 2, average: 4.5 })
    expect(tablesRead).toEqual(['products', 'reviews'])
    // 42703 is the expected state until 221 is applied. Warning on it every
    // render would train everyone to ignore this log line.
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and still falls back when the cache read fails for any other reason', async () => {
    productsResult = { data: null, error: { code: '08006', message: 'connection failure' } }
    reviewsResult = { data: [{ product_id: 'p1', rating: 3 }], error: null }
    const out = await getRatingSummaries(['p1'])
    expect(out.get('p1')).toEqual({ count: 1, average: 3 })
    expect(warn).toHaveBeenCalled()
  })

  it('returns an empty map for an empty request without reading anything', async () => {
    const out = await getRatingSummaries([])
    expect(out.size).toBe(0)
    expect(tablesRead).toEqual([])
  })
})
