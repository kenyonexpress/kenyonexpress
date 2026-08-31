import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A failed catalogue read must THROW, not resolve to an empty list.
 *
 * `src/lib/category-page.ts` documents, in its header, that `cacheLife`'s
 * one-day expire exists so that "if Supabase is unreachable, the last good
 * catalogue keeps being served instead of an empty grid". Every read in the
 * file then discarded its `error`, which inverted that exact promise: a failed
 * query produced `data: null`, `?? []` turned it into an empty list, and the
 * enclosing `use cache` scope stored that as a good answer. The failure did not
 * fall back to the last good catalogue. It replaced it, for the full cache
 * life, with nothing written to any log.
 *
 * Measured on a built server 2026-08-20: /products rendered
 * "no products match your selection" while /, /category/hot-deals and /search
 * all rendered products from the same table, and the identical query returned
 * 24 rows over REST. A server restart brought all 24 back.
 *
 * `use cache` does not store a result for a scope that threw, so throwing is
 * what makes the header's promise true.
 */

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const readResult = { data: null as unknown, count: null as number | null, error: null as unknown }

vi.mock('@/lib/supabase/anon', () => {
  // A thenable query builder: every chained method returns `this`, and awaiting
  // it resolves to whatever `readResult` currently holds.
  const builder: Record<string, unknown> = {}
  for (const method of [
    'from',
    'select',
    'eq',
    'is',
    'or',
    'gte',
    'lte',
    'order',
    'limit',
    'range',
    'single',
  ]) {
    builder[method] = () => builder
  }
  // A PostgREST query builder IS a thenable: that is how
  // `await supabase.from(...).select(...)` resolves with no terminal call, and
  // how `.order()` can be both chained and awaited. A mock without `then`
  // cannot reproduce the call sites under test.
  // biome-ignore lint/suspicious/noThenProperty: see above
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...readResult })
  return { createPublicClient: () => builder }
})

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({ log: { error: (...a: unknown[]) => logError(...a) } }))

const { getShopProducts, getCategoryBySlug } = await import('./category-page')

beforeEach(() => {
  logError.mockClear()
  readResult.data = null
  readResult.count = null
  readResult.error = null
})

describe('a failed catalogue read', () => {
  it('throws instead of returning an empty shop', async () => {
    readResult.error = { code: '42501', message: 'permission denied for table products' }

    await expect(getShopProducts({ sort: 'name', page: 1 })).rejects.toThrow(/shop_products_failed/)
  })

  it('logs the failure, so it is diagnosable rather than silent', async () => {
    readResult.error = { code: '42501', message: 'permission denied for table products' }

    await expect(getShopProducts({ sort: 'name', page: 1 })).rejects.toThrow()
    expect(logError).toHaveBeenCalledWith(
      'catalogue.shop_products_failed',
      expect.objectContaining({ error: expect.objectContaining({ code: '42501' }) }),
    )
  })

  it('still returns an empty list when the query genuinely matches nothing', async () => {
    // The point of the gate is to separate "the read failed" from "there is
    // nothing to read". Only the first is an error.
    readResult.data = []
    readResult.count = 0

    await expect(getShopProducts({ sort: 'name', page: 1 })).resolves.toEqual({
      items: [],
      total: 0,
    })
    expect(logError).not.toHaveBeenCalled()
  })

  it('treats PGRST103 as "that page is past the end", not as a failure', async () => {
    // /products?page=9999 asks PostgREST for an offset past the last row, and
    // it answers 416 PGRST103. The page clamps to the last page from the empty
    // result. An earlier draft of this fix threw here and broke that; the two
    // clamping specs in e2e/category.spec.ts caught it.
    readResult.error = {
      code: 'PGRST103',
      details: 'An offset of 239952 was requested, but there are only 61 rows.',
      message: 'Requested range not satisfiable',
    }

    await expect(getShopProducts({ sort: 'name', page: 9999 })).resolves.toEqual({
      items: [],
      total: 0,
    })
    expect(logError).not.toHaveBeenCalled()
  })

  it('treats PGRST116 as "no such row", not as a failure', async () => {
    // `.single()` reports zero rows as an error code. Callers already handle the
    // null that comes with it, so throwing there would break real 404s.
    readResult.error = { code: 'PGRST116', message: 'JSON object requested, 0 rows returned' }

    await expect(getCategoryBySlug('no-such-category')).resolves.toBeNull()
    expect(logError).not.toHaveBeenCalled()
  })
})
