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

const { getDealOfTheDay, getHomeBrands, getHomeCategoryTiles, getHotCouponDeals } = await import(
  './below-fold'
)
const { HOME_CATEGORY_TILE_COUNT, HOT_COUPON_COUNT } = await import('./below-fold-rules')
const { MERCHANT_DIRECTORY_PRODUCT_COLUMNS, MERCHANT_DIRECTORY_SUPPLIER_COLUMNS } = await import(
  '@/lib/merchant-directory'
)

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
    // UX10: a deal past its deadline is not hot; unset deadlines stay in.
    const [[orFilter]] = calls(chain, 'or') as [[string]]
    expect(orFilter).toMatch(/^valid_until\.is\.null,valid_until\.gt\.\d{4}-\d\d-\d\dT/)
    expect(calls(chain, 'select')[0]?.[0]).toContain('valid_until')
    expect(calls(chain, 'order')).toEqual([
      ['discount_percentage', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: false }],
    ])
    expect(calls(chain, 'limit')).toEqual([[HOT_COUPON_COUNT]])
  })

  it('passes the rows through with the code from the optional 270 read, null until it exists', async () => {
    const rows = [{ id: 'c1', title_he: 'קופון', business_name: 'עסק' }]
    results.push({ data: rows, error: null })
    // The second chain is the `code` probe (pending 270); 42703 is the hosted
    // database today, and it must cost the card its button, not the section.
    results.push({ data: null, error: { code: '42703', message: 'column code does not exist' } })
    await expect(getHotCouponDeals()).resolves.toEqual([{ ...rows[0], code: null }])
    const probe = chains[1]
    expect(probe?.[0]).toEqual(['from', ['coupon_deals']])
    expect(calls(probe, 'select')).toEqual([['id, code']])
    expect(calls(probe, 'in')).toEqual([['id', ['c1']]])
    expect(warn).toHaveBeenCalledWith(
      'db.optional_column_missing',
      expect.objectContaining({ detail: expect.stringContaining('270_coupon_deals_code.sql') }),
    )
  })

  it('attaches the code once the column answers, and survives a failed code read', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }]
    results.push({ data: rows, error: null })
    results.push({ data: [{ id: 'c2', code: 'SPA90' }], error: null })
    await expect(getHotCouponDeals()).resolves.toEqual([
      { id: 'c1', code: null },
      { id: 'c2', code: 'SPA90' },
    ])

    results.length = 0
    results.push({ data: rows, error: null })
    results.push({ data: null, error: { message: 'replica gone' } })
    await expect(getHotCouponDeals()).resolves.toEqual([
      { id: 'c1', code: null },
      { id: 'c2', code: null },
    ])
    expect(warn).toHaveBeenCalledWith('homepage.hot_coupons_code_read_failed', {
      reason: 'hot coupons: replica gone',
    })
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

describe('getHomeBrands (UX11)', () => {
  const supplier = (id: string, name: string, logo_url: string | null = null) => ({
    id,
    name,
    city: null,
    logo_url,
    status: 'active',
    deleted_at: null,
  })

  it('makes the merchant directory\u2019s two reads, through its column constants', async () => {
    results.push({ data: [], error: null }, { data: [], error: null })
    await getHomeBrands()
    const [suppliers, products] = chains
    expect(suppliers?.[0]).toEqual(['from', ['suppliers']])
    expect(calls(suppliers, 'select')).toEqual([[MERCHANT_DIRECTORY_SUPPLIER_COLUMNS]])
    expect(calls(suppliers, 'eq')).toEqual([['status', 'active']])
    expect(calls(suppliers, 'is')).toEqual([['deleted_at', null]])
    expect(products?.[0]).toEqual(['from', ['products']])
    expect(calls(products, 'select')).toEqual([[MERCHANT_DIRECTORY_PRODUCT_COLUMNS]])
    expect(calls(products, 'eq')).toEqual([['status', 'active']])
    expect(calls(products, 'not')).toEqual([['supplier_id', 'is', null]])
  })

  it('returns the merchants with a product on sale as tiles, logos first', async () => {
    results.push(
      {
        data: [supplier('a', 'אלף'), supplier('b', 'בית', '/images/b.webp'), supplier('c', 'גימל')],
        error: null,
      },
      {
        data: [
          { supplier_id: 'a', categories: null },
          { supplier_id: 'a', categories: null },
          { supplier_id: 'b', categories: null },
        ],
        error: null,
      },
    )
    const tiles = await getHomeBrands()
    expect(tiles).toEqual([
      { id: 'b', name: 'בית', logoUrl: '/images/b.webp', href: '/s/b' },
      { id: 'a', name: 'אלף', logoUrl: null, href: '/s/a' },
    ])
  })

  it('returns nothing and warns when either read fails or the client throws', async () => {
    results.push({ data: null, error: { message: 'suppliers down' } }, { data: [], error: null })
    expect(await getHomeBrands()).toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.brands_suppliers_read_failed', {
      reason: 'suppliers down',
    })

    results.length = 0
    results.push({ data: [], error: null }, { data: null, error: { message: 'products down' } })
    expect(await getHomeBrands()).toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.brands_products_read_failed', {
      reason: 'products down',
    })

    clientThrows = new Error('no key')
    expect(await getHomeBrands()).toEqual([])
    expect(warn).toHaveBeenCalledWith('homepage.brands_read_threw', { reason: 'no key' })
  })
})
