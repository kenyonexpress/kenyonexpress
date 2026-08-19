import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EVERY cached catalogue read must THROW on a failed query, not resolve empty.
 *
 * `category-page-read-failure.test.ts` pins this for one file. This one pins it
 * for the five that were still discarding their `error` after that fix landed,
 * and it exists because a helper private to one module is not a property of the
 * codebase - it is a property of that module.
 *
 * The failure mode is the same in all of them. A failed query yields
 * `data: null`, `?? []` turns that into an empty list, and the enclosing
 * `use cache` scope stores it as a good answer. The failure does not fall back
 * to the last good catalogue, it REPLACES it, for the full cache life, with
 * nothing in any log. Two of these are worse than an empty grid:
 *
 *   getFeedProducts            an empty Merchant/RSS feed, cached. This file's
 *                              own header records that a silently-failing key
 *                              "once collapsed the sitemap to three URLs" -
 *                              the same bug, patched at the client layer.
 *   sitemap                    the literal event that header describes, and it
 *                              kept the bug through BOTH fixes: the second one
 *                              was recorded as covering the sitemap through
 *                              getFeedProducts, which in fact only backs
 *                              feed.xml and merchant.xml. Its two reads are its
 *                              own, and a cached sitemap listing no products is
 *                              a deindexing request that outlives the failure.
 *   listProductSlugsForPrerender  and getActiveCouponDealIds feed
 *                              generateStaticParams: a failed read at build
 *                              time bakes a deploy with zero prerendered pages
 *                              and exits 0.
 *
 * Each reader gets three cases, and the two negative controls are the point:
 * without them "throws" could be satisfied by throwing on every empty shop.
 *
 *   error present            -> throws, and writes one log.error
 *   no error, no rows        -> resolves empty, silently
 *   PGRST116 (.single() miss) -> resolves null, silently. A real 404.
 */

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const readResult = { data: null as unknown, error: null as unknown }

/**
 * A thenable query builder: every chained method returns `this`, and awaiting
 * it resolves to whatever `readResult` currently holds. A PostgREST builder IS
 * a thenable - that is how `await supabase.from(...).select(...)` resolves with
 * no terminal call - so a mock without `then` cannot reproduce these calls.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'from',
    'select',
    'eq',
    'neq',
    'is',
    'not',
    'in',
    'or',
    'gte',
    'lte',
    'order',
    'limit',
    'range',
    'single',
    'maybeSingle',
  ]) {
    builder[method] = () => builder
  }
  // biome-ignore lint/suspicious/noThenProperty: see the comment above
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...readResult })
  return builder
}

vi.mock('@/lib/supabase/anon', () => ({ createPublicClient: () => makeBuilder() }))
// product-detail's supplier read goes through the admin client and deliberately
// does NOT throw (a missing supplier degrades one block, it does not 404 the
// page). It is never reached in these tests, which all fail on the read before.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeBuilder() }))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() },
}))

const { loadRelatedProducts } = await import('./related-products')
const { getProductSeoBySlug } = await import('./product-seo')
const { getCouponDeal, getActiveCouponDealIds } = await import('./coupon-deals')
const { getFeedProducts } = await import('./feeds/catalogue')
const { loadProductBySlug, listProductSlugsForPrerender } = await import('./product-detail')
const { default: sitemap } = await import('@/app/sitemap')

/** Every cached reader, with the empty value each is expected to resolve to. */
const READERS: Array<{ name: string; run: () => Promise<unknown>; empty: unknown }> = [
  { name: 'loadRelatedProducts', run: () => loadRelatedProducts('cat-1', 'p-1'), empty: [] },
  { name: 'getProductSeoBySlug', run: () => getProductSeoBySlug('a-slug'), empty: null },
  { name: 'getCouponDeal', run: () => getCouponDeal('deal-1'), empty: null },
  { name: 'getActiveCouponDealIds', run: () => getActiveCouponDealIds(), empty: [] },
  { name: 'getFeedProducts', run: () => getFeedProducts(10), empty: [] },
  { name: 'loadProductBySlug', run: () => loadProductBySlug('a-slug'), empty: null },
  { name: 'listProductSlugsForPrerender', run: () => listProductSlugsForPrerender(10), empty: [] },
]

beforeEach(() => {
  readResult.data = null
  readResult.error = null
  logError.mockClear()
})

describe.each(READERS)('$name', ({ run, empty }) => {
  it('throws and logs when the query fails', async () => {
    readResult.error = { code: '08006', message: 'connection failure' }
    await expect(run()).rejects.toThrow(/connection failure/)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('resolves empty and stays silent when the table genuinely has no rows', async () => {
    readResult.data = Array.isArray(empty) ? [] : null
    await expect(run()).resolves.toEqual(empty)
    expect(logError).not.toHaveBeenCalled()
  })

  it('treats PGRST116 as an answer, not a failure', async () => {
    readResult.error = { code: 'PGRST116', message: 'no rows returned' }
    await expect(run()).resolves.toEqual(empty)
    expect(logError).not.toHaveBeenCalled()
  })
})

/**
 * The sitemap does not fit the table above: on a genuinely empty catalogue it
 * still returns the static entries, so "resolves empty" is the wrong control.
 * The contract is the same one, stated in its own terms - no /product/ and no
 * /category/ URL may ever be produced by a FAILED read.
 */
describe('sitemap', () => {
  const catalogueUrls = (entries: Array<{ url: string }>) =>
    entries.filter((e) => e.url.includes('/product/') || e.url.includes('/category/'))

  it('throws and logs when the catalogue read fails', async () => {
    readResult.error = { code: '08006', message: 'connection failure' }
    await expect(sitemap()).rejects.toThrow(/connection failure/)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('serves the static entries and stays silent when the catalogue is genuinely empty', async () => {
    readResult.data = []
    const entries = await sitemap()
    expect(catalogueUrls(entries)).toEqual([])
    expect(entries.length).toBeGreaterThan(0)
    expect(logError).not.toHaveBeenCalled()
  })
})
