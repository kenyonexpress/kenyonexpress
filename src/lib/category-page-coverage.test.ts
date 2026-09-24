import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The cached catalogue readers, at the query level: which PostgREST chain
 * each one builds (filters, order keys, range) and how the joins are
 * normalised on the way out. The pure helpers are in category-page.test.ts
 * and the failure contract in category-page-read-failure.test.ts.
 */

type Result = { data: unknown; count: number | null; error: unknown }
type Chain = [string, unknown[]][]

const results: Result[] = []
const chains: Chain[] = []

function settle(): Result {
  if (results.length === 0) return { data: null, count: null, error: null }
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
  createCatalogueReadClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const {
  CATEGORY_PAGE_SIZE,
  SHOP_PAGE_SIZE,
  getAllCategories,
  getAllCategorySlugs,
  getCategoryBySlug,
  getCategoryChildren,
  getCategoryParent,
  getCategoryProducts,
  getCategoryProductsCached,
  getShopProducts,
  getShopProductsCached,
  parseCity,
} = await import('./category-page')

const CAT = { name_he: 'מסעדות', slug: 'restaurants-cafes' }
const CATEGORY_ID = 'bd5932c1-51a8-47a5-b64c-551b8692b53c'

function product(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    slug: id,
    name_he: id,
    kenyon_price: 10,
    full_price: 20,
    images: [],
    stock_quantity: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    categories: null,
    ...extra,
  }
}

function calls(chain: Chain, method: string): unknown[][] {
  return chain.filter(([m]) => m === method).map(([, args]) => args)
}

function orders(chain: Chain): unknown[][] {
  return calls(chain, 'order')
}

beforeEach(() => {
  results.length = 0
  chains.length = 0
})

describe('category reads', () => {
  it('getCategoryBySlug reads one active row by slug', async () => {
    results.push({ data: { id: 'c1', slug: 'pets' }, count: null, error: null })
    expect(await getCategoryBySlug('pets')).toEqual({ id: 'c1', slug: 'pets' })
    const chain = chains[0] as Chain
    expect(chain[0]).toEqual(['from', ['categories']])
    expect(calls(chain, 'eq')).toEqual([
      ['slug', 'pets'],
      ['is_active', true],
    ])
    expect(chain.at(-1)?.[0]).toBe('single')
  })

  it('getAllCategorySlugs lists active slugs in menu order', async () => {
    results.push({ data: [{ slug: 'b' }, { slug: 'a' }], count: null, error: null })
    expect(await getAllCategorySlugs()).toEqual(['b', 'a'])
    const chain = chains[0] as Chain
    expect(calls(chain, 'eq')).toEqual([['is_active', true]])
    expect(orders(chain)).toEqual([
      ['sort_order', { ascending: true }],
      ['slug', { ascending: true }],
    ])
  })

  it('getAllCategorySlugs and getCategoryChildren answer empty for a null payload', async () => {
    results.push({ data: null, count: null, error: null })
    expect(await getAllCategorySlugs()).toEqual([])
    expect(await getCategoryChildren('c1')).toEqual([])
  })

  it('getCategoryParent reads the parent by id', async () => {
    results.push({ data: { slug: 'p', name_he: 'הורה' }, count: null, error: null })
    expect(await getCategoryParent('parent-id')).toEqual({ slug: 'p', name_he: 'הורה' })
    expect(calls(chains[0] as Chain, 'eq')).toEqual([['id', 'parent-id']])
  })

  it('getCategoryChildren reads active children in menu order', async () => {
    const rows = [{ id: 'k', slug: 'k', name_he: 'k' }]
    results.push({ data: rows, count: null, error: null })
    expect(await getCategoryChildren('c1')).toEqual(rows)
    const chain = chains[0] as Chain
    expect(calls(chain, 'eq')).toEqual([
      ['parent_id', 'c1'],
      ['is_active', true],
    ])
    expect(orders(chain).map((o) => o[0])).toEqual(['sort_order', 'slug'])
  })

  it('getAllCategories repairs a sign-first price in the name on the way out', async () => {
    results.push({
      data: [
        { slug: 'under-99', name_he: 'עד ₪99' },
        { slug: 'pets', name_he: 'חיות מחמד' },
      ],
      count: null,
      error: null,
    })
    const rows = await getAllCategories()
    expect(rows[1]).toEqual({ slug: 'pets', name_he: 'חיות מחמד' })
    const repaired = rows[0]?.name_he ?? ''
    expect(repaired).not.toBe('עד ₪99')
    expect(repaired.indexOf('99')).toBeLessThan(repaired.indexOf('₪'))

    results.length = 0
    results.push({ data: null, count: null, error: null })
    expect(await getAllCategories()).toEqual([])
  })
})

describe('getCategoryProducts', () => {
  const base = { categoryId: CATEGORY_ID, category: CAT, sort: 'menu_order' as const, page: 1 }

  it('reads the active page for the category, featured first then by name', async () => {
    results.push({ data: [product('a')], count: 9, error: null })
    const { items, total } = await getCategoryProducts(base)

    expect(total).toBe(9)
    expect(items).toEqual([{ ...product('a'), categories: [CAT], supplier: null }])
    const chain = chains[0] as Chain
    expect(chain[0]).toEqual(['from', ['products']])
    expect((chain[1] as [string, unknown[]])[1][1]).toEqual({ count: 'exact' })
    expect(calls(chain, 'eq')).toEqual([
      ['status', 'active'],
      ['category_id', CATEGORY_ID],
    ])
    expect(calls(chain, 'is')).toEqual([['deleted_at', null]])
    expect(orders(chain)).toEqual([
      ['is_featured', { ascending: false, nullsFirst: false }],
      ['name_he', { ascending: true }],
    ])
    expect(calls(chain, 'range')).toEqual([[0, CATEGORY_PAGE_SIZE - 1]])
  })

  it('pages by CATEGORY_PAGE_SIZE and reads a null count as zero', async () => {
    results.push({ data: null, count: null, error: null })
    expect(await getCategoryProducts({ ...base, page: 3 })).toEqual({ items: [], total: 0 })
    expect(calls(chains[0] as Chain, 'range')).toEqual([[16, 23]])
  })

  it('orders each explicit sort on the column the card shows', async () => {
    results.push({ data: [], count: 0, error: null })
    const expected: Record<string, unknown[][]> = {
      price_asc: [['kenyon_price', { ascending: true, nullsFirst: false }]],
      price_desc: [['kenyon_price', { ascending: false, nullsFirst: false }]],
      name: [['name_he', { ascending: true }]],
      newest: [['created_at', { ascending: false }]],
      popularity: [
        ['is_featured', { ascending: false, nullsFirst: false }],
        ['name_he', { ascending: true }],
      ],
    }
    for (const [sort, order] of Object.entries(expected)) {
      chains.length = 0
      await getCategoryProducts({ ...base, sort: sort as typeof base.sort })
      expect(orders(chains[0] as Chain), sort).toEqual(order)
    }
  })

  it('applies the price bounds and the product-type facet', async () => {
    results.push({ data: [], count: 0, error: null })
    await getCategoryProducts({ ...base, priceMin: 10, priceMax: 99, productType: 'coupon' })
    let chain = chains[0] as Chain
    expect(calls(chain, 'gte')).toEqual([['kenyon_price', 10]])
    expect(calls(chain, 'lte')).toEqual([['kenyon_price', 99]])
    expect(calls(chain, 'or')).toEqual([['type.eq.coupon,is_coupon_enabled.is.true']])

    chains.length = 0
    await getCategoryProducts({ ...base, productType: 'physical' })
    chain = chains[0] as Chain
    expect(calls(chain, 'or')).toEqual([['and(type.neq.coupon,is_coupon_enabled.is.false)']])
    expect(calls(chain, 'gte')).toEqual([])
  })

  it('widens a collection to its rule, keeping the hand-assigned rows', async () => {
    results.push({ data: [], count: 0, error: null })
    await getCategoryProducts({ ...base, collection: { kind: 'featured' } })
    expect(calls(chains[0] as Chain, 'or')).toEqual([
      [`category_id.eq.${CATEGORY_ID},is_featured.is.true`],
    ])
    expect(calls(chains[0] as Chain, 'eq')).toEqual([['status', 'active']])

    chains.length = 0
    await getCategoryProducts({ ...base, collection: { kind: 'price_max', maxIls: 99 } })
    expect(calls(chains[0] as Chain, 'or')).toEqual([
      [`category_id.eq.${CATEGORY_ID},kenyon_price.lte.99`],
    ])
  })

  it('fetches the newest ids in a separate query and lists them in the group', async () => {
    results.push({ data: [{ id: 'n1' }, { id: 'n2' }], count: null, error: null })
    results.push({ data: [], count: 0, error: null })
    await getCategoryProducts({ ...base, collection: { kind: 'newest', limit: 24 } })

    // The page query is BUILT first and the id lookup runs inside it, so the
    // chains record in that order while the results resolve ids-first.
    const [page, ids] = chains as [Chain, Chain]
    expect(ids[0]).toEqual(['from', ['products']])
    expect(calls(ids, 'eq')).toEqual([['status', 'active']])
    expect(orders(ids)).toEqual([['created_at', { ascending: false }]])
    expect(calls(ids, 'limit')).toEqual([[24]])
    expect(calls(page, 'or')).toEqual([[`category_id.eq.${CATEGORY_ID},id.in.(n1,n2)`]])
  })

  it('collapses the newest group to the hand-assigned rows when there are no ids', async () => {
    results.push({ data: null, count: null, error: null })
    results.push({ data: [], count: 0, error: null })
    await getCategoryProducts({ ...base, collection: { kind: 'newest', limit: 24 } })
    expect(calls(chains[0] as Chain, 'or')).toEqual([[`category_id.eq.${CATEGORY_ID}`]])
  })

  it('normalises the category and supplier joins whatever shape PostgREST returns', async () => {
    const other = { name_he: 'אחר', slug: 'other' }
    results.push({
      data: [
        product('array', {
          categories: [other, CAT],
          suppliers: [{ city: 'חיפה' }, { city: 'x' }],
        }),
        product('object', { categories: other, suppliers: { city: 'אילת' } }),
        product('none', { categories: [], suppliers: null }),
        product('absent'),
      ],
      count: 4,
      error: null,
    })
    const { items } = await getCategoryProducts(base)
    expect(items.map((i) => [i.id, i.categories, i.supplier])).toEqual([
      ['array', [other], { city: 'חיפה' }],
      ['object', [other], { city: 'אילת' }],
      ['none', [CAT], null],
      ['absent', [CAT], null],
    ])
  })

  it('filters the fetched page by city and counts only what is left', async () => {
    results.push({
      data: [
        product('tlv', { suppliers: { city: 'תל אביב' } }),
        product('tlv-hyphen', { suppliers: { city: 'תל-אביב יפו' } }),
        product('haifa', { suppliers: { city: 'חיפה' } }),
        product('nowhere'),
      ],
      count: 80,
      error: null,
    })
    const { items, total } = await getCategoryProducts({ ...base, city: 'tel-aviv' })
    expect(items.map((i) => i.id)).toEqual(['tlv', 'tlv-hyphen'])
    expect(total).toBe(2)
  })
})

describe('getShopProducts', () => {
  it('reads the whole active catalogue by name, 24 a page', async () => {
    results.push({ data: [product('a', { categories: CAT })], count: 61, error: null })
    const { items, total } = await getShopProducts({ sort: 'menu_order', page: 2 })

    expect(total).toBe(61)
    expect(items).toEqual([{ ...product('a'), categories: [CAT] }])
    const chain = chains[0] as Chain
    expect(calls(chain, 'eq')).toEqual([['status', 'active']])
    expect(calls(chain, 'is')).toEqual([['deleted_at', null]])
    expect(orders(chain)).toEqual([['name_he', { ascending: true }]])
    expect(calls(chain, 'range')).toEqual([[SHOP_PAGE_SIZE, 2 * SHOP_PAGE_SIZE - 1]])
  })

  it('orders each explicit sort like the category page', async () => {
    results.push({ data: [], count: 0, error: null })
    const expected: Record<string, unknown[]> = {
      price_asc: ['kenyon_price', { ascending: true, nullsFirst: false }],
      price_desc: ['kenyon_price', { ascending: false, nullsFirst: false }],
      name: ['name_he', { ascending: true }],
      newest: ['created_at', { ascending: false }],
    }
    for (const [sort, order] of Object.entries(expected)) {
      chains.length = 0
      await getShopProducts({ sort: sort as 'name', page: 1 })
      expect(orders(chains[0] as Chain), sort).toEqual([order])
    }
  })

  it('applies price bounds and the type facet', async () => {
    results.push({ data: [], count: 0, error: null })
    await getShopProducts({
      sort: 'name',
      page: 1,
      priceMin: 5,
      priceMax: 50,
      productType: 'physical',
    })
    const chain = chains[0] as Chain
    expect(calls(chain, 'gte')).toEqual([['kenyon_price', 5]])
    expect(calls(chain, 'lte')).toEqual([['kenyon_price', 50]])
    expect(calls(chain, 'or')).toEqual([['and(type.neq.coupon,is_coupon_enabled.is.false)']])

    chains.length = 0
    await getShopProducts({ sort: 'name', page: 1, productType: 'coupon' })
    expect(calls(chains[0] as Chain, 'or')).toEqual([['type.eq.coupon,is_coupon_enabled.is.true']])
  })

  it('normalises the category join to a list, empty when there is none', async () => {
    results.push({
      data: [
        product('arr', { categories: [CAT] }),
        product('obj', { categories: CAT }),
        product('none', { categories: null }),
      ],
      count: 3,
      error: null,
    })
    const { items } = await getShopProducts({ sort: 'name', page: 1 })
    expect(items.map((i) => i.categories)).toEqual([[CAT], [CAT], []])
  })

  it('reads a null payload as an empty page', async () => {
    results.push({ data: null, count: null, error: null })
    expect(await getShopProducts({ sort: 'name', page: 1 })).toEqual({ items: [], total: 0 })
  })
})

describe('parseCity', () => {
  it('accepts a known city slug, the first of a repeated param, and nothing else', () => {
    expect(parseCity('tel-aviv')).toBe('tel-aviv')
    expect(parseCity(['haifa', 'tel-aviv'])).toBe('haifa')
    expect(parseCity('atlantis')).toBeUndefined()
    expect(parseCity(undefined)).toBeUndefined()
    expect(parseCity([])).toBeUndefined()
  })
})

describe('request-scoped wrappers', () => {
  it('expose the same readers through react cache', async () => {
    results.push({ data: [], count: 0, error: null })
    expect(
      await getCategoryProductsCached({
        categoryId: CATEGORY_ID,
        category: CAT,
        sort: 'name',
        page: 1,
      }),
    ).toEqual({ items: [], total: 0 })
    expect(await getShopProductsCached({ sort: 'name', page: 1 })).toEqual({ items: [], total: 0 })
  })
})
