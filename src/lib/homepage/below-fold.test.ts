import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three cached readers behind the sections under the deals grid, at the
 * query level and at the failure contract. The pure ranking and tiling rules
 * are in below-fold-rules.test.ts; this file pins what the module itself
 * promises: which PostgREST chain each reader builds, how the joins are
 * normalised on the way out, and that NONE of them throws. A failed read
 * here must render an empty section, not take the home page down.
 */

type Result = { data: unknown; error: unknown }
type Chain = [string, unknown[]][]

const results: Result[] = []
const chains: Chain[] = []
let clientThrows: Error | null = null

const warn = vi.fn()

function settle(): Result {
  if (results.length === 0) return { data: null, error: null }
  return results.length === 1 ? (results[0] as Result) : (results.shift() as Result)
}

function builder(table: string): unknown {
  const chain: Chain = [['from', [table]]]
  chains.push(chain)
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle()).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          chain.push([String(prop), args])
          return proxy
        }
      },
    },
  )
  return proxy
}

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/supabase/read-replica', () => ({
  createCatalogueReadClient: () => {
    if (clientThrows) throw clientThrows
    return { from: (table: string) => builder(table) }
  },
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: vi.fn(),
    warn: (...args: unknown[]) => warn(...args),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { getDealOfTheDay, getHomeCategoryTiles, getHotCouponDeals } = await import('./below-fold')
const { HOME_CATEGORY_TILE_COUNT, HOT_COUPON_COUNT } = await import('./below-fold-rules')

function calls(chain: Chain | undefined, method: string): unknown[][] {
  return (chain ?? []).filter(([name]) => name === method).map(([, args]) => args)
}

beforeEach(() => {
  results.length = 0
  chains.length = 0
  clientThrows = null
  warn.mockClear()
})

describe('getHomeCategoryTiles', () => {
  it('reads the active top-level categories in menu order', async () => {
    results.push({ data: [], error: null })
    await getHomeCategoryTiles()
    const chain = chains[0]
    expect(chain?.[0]).toEqual(['from', ['categories']])
    expect(calls(chain, 'eq')).toEqual([['is_active', true]])
    expect(calls(chain, 'is')).toEqual([
      ['parent_id', null],
      ['deleted_at', null],
    ])
    // `orderedByMenu`: sort_order first, slug as the tie-break.
    expect(calls(chain, 'order')).toEqual([
      ['sort_order', { ascending: true }],
      ['slug', { ascending: true }],
    ])
  })

  it('maps rows through the tile rules, photographed tiles first', async () => {
    results.push({
      data: [
        { slug: 'no-photo', name_he: 'בלי תמונה', image_url: null },
        { slug: 'courses', name_he: 'קורסים', image_url: null },
        { slug: 'uploaded', name_he: 'הועלה', image_url: 'https://r2.example/x.webp' },
      ],
      error: null,
    })
    const tiles = await getHomeCategoryTiles()
    expect(tiles.map((t) => t.slug)).toEqual(['courses', 'uploaded', 'no-photo'])
    // The row's own upload wins; the ingested file fills a known slug; an
    // unknown slug without an upload is kept, not dropped.
    expect(tiles.find((t) => t.slug === 'uploaded')?.imageUrl).toBe('https://r2.example/x.webp')
    expect(tiles.find((t) => t.slug === 'courses')?.imageUrl).toMatch(/^\/images\//)
    expect(tiles.find((t) => t.slug === 'no-photo')?.imageUrl).toBeNull()
    expect(tiles.length).toBeLessThanOrEqual(HOME_CATEGORY_TILE_COUNT)
  })

  it('returns nothing and warns when the read fails', async () => {
    results.push({ data: null, error: { message: 'relation does not exist' } })
    await expect(getHomeCategoryTiles()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.categories_read_failed', {
      reason: 'relation does not exist',
    })
  })

  it('returns nothing and warns when the client itself throws', async () => {
    clientThrows = new Error('no replica url')
    await expect(getHomeCategoryTiles()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.categories_read_threw', {
      reason: 'no replica url',
    })
  })
})

function candidate(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    slug: id,
    name_he: `מוצר ${id}`,
    status: 'active',
    stock_quantity: 5,
    kenyon_price_agorot: 5000,
    full_price_agorot: 10000,
    images: [`https://img.example/${id}.webp`],
    categories: null,
    ...extra,
  }
}

describe('getDealOfTheDay', () => {
  it('reads the whole active catalogue and ranks it in code', async () => {
    results.push({ data: [], error: null })
    await getDealOfTheDay()
    const chain = chains[0]
    expect(chain?.[0]).toEqual(['from', ['products']])
    expect(calls(chain, 'eq')).toEqual([['status', 'active']])
    expect(calls(chain, 'is')).toEqual([['deleted_at', null]])
    expect(calls(chain, 'limit')).toEqual([])
    expect(calls(chain, 'order')).toEqual([])
  })

  it('picks the deepest discount and normalises the category join', async () => {
    results.push({
      data: [
        candidate('shallow', { kenyon_price_agorot: 9000 }),
        // PostgREST may hand the FK join back as a one-element array.
        candidate('deep', {
          kenyon_price_agorot: 2500,
          categories: [{ name_he: 'ספא', slug: 'spa' }],
        }),
        candidate('deeper-no-photo', { kenyon_price_agorot: 1000, images: [] }),
      ],
      error: null,
    })
    const deal = await getDealOfTheDay()
    expect(deal).toMatchObject({
      id: 'deep',
      slug: 'deep',
      nameHe: 'מוצר deep',
      imageUrl: 'https://img.example/deep.webp',
      priceAgorot: 2500,
      referenceAgorot: 10000,
      discountBp: 7500,
      category: { name_he: 'ספא', slug: 'spa' },
    })
  })

  it('keeps an object join as it is and a missing join as null', async () => {
    results.push({
      data: [candidate('obj', { categories: { name_he: 'מלונות', slug: 'vacation' } })],
      error: null,
    })
    expect((await getDealOfTheDay())?.category).toEqual({ name_he: 'מלונות', slug: 'vacation' })

    results.length = 0
    chains.length = 0
    results.push({ data: [candidate('none', { categories: [] })], error: null })
    expect((await getDealOfTheDay())?.category).toBeNull()
  })

  it('is null on an empty catalogue', async () => {
    results.push({ data: [], error: null })
    await expect(getDealOfTheDay()).resolves.toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('is null and warns when the read fails or the client throws', async () => {
    results.push({ data: null, error: { message: 'timeout' } })
    await expect(getDealOfTheDay()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith('homepage.deal_of_the_day_read_failed', { reason: 'timeout' })

    clientThrows = new Error('boom')
    await expect(getDealOfTheDay()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith('homepage.deal_of_the_day_read_threw', { reason: 'boom' })
  })
})

describe('getHotCouponDeals', () => {
  it('reads one screen of active coupon deals, deepest discount first', async () => {
    results.push({ data: [], error: null })
    await getHotCouponDeals()
    const chain = chains[0]
    expect(chain?.[0]).toEqual(['from', ['coupon_deals']])
    expect(calls(chain, 'eq')).toEqual([['status', 'active']])
    expect(calls(chain, 'is')).toEqual([['deleted_at', null]])
    expect(calls(chain, 'order')).toEqual([
      ['discount_percentage', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: false }],
    ])
    expect(calls(chain, 'limit')).toEqual([[HOT_COUPON_COUNT]])
  })

  it('passes the rows through untouched', async () => {
    const rows = [{ id: 'c1', title_he: 'קופון', business_name: 'עסק' }]
    results.push({ data: rows, error: null })
    await expect(getHotCouponDeals()).resolves.toEqual(rows)
  })

  it('returns nothing and warns when the read fails or the client throws', async () => {
    results.push({ data: null, error: { message: 'denied' } })
    await expect(getHotCouponDeals()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.hot_coupons_read_failed', { reason: 'denied' })

    clientThrows = new Error('no replica url')
    await expect(getHotCouponDeals()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.hot_coupons_read_threw', {
      reason: 'no replica url',
    })
  })

  it('reports an unknown reason for a non-Error throw', async () => {
    clientThrows = 'string' as unknown as Error
    await expect(getHotCouponDeals()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.hot_coupons_read_threw', { reason: 'unknown' })
  })
})
