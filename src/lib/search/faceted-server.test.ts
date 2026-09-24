import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The engine half of faceted search. Two engines, one response shape: the
 * Meilisearch request that leaves (URL, bearer, body) and the fallback that
 * takes over on any failure, so a caller cannot tell which one answered.
 */

type Result = { data: unknown; error: unknown }

const dbResult: Result = { data: [], error: null }
const chains: [string, unknown[]][][] = []

function builder(table: string): unknown {
  const chain: [string, unknown[]][] = [['from', [table]]]
  chains.push(chain)
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ ...dbResult }).then(resolve, reject)
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

const logInfo = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    info: (...a: unknown[]) => logInfo(...a),
    error: (...a: unknown[]) => logError(...a),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const { activeFacetNames, facetedSearch, facetedSearchCached } = await import('./faceted-server')

const ROWS = [
  {
    id: 'p1',
    slug: 'pizza',
    name_he: 'פיצה משפחתית',
    name_en: null,
    brand: 'דומינוס',
    short_description_he: null,
    description_he: 'פיצה',
    sku: null,
    type: 'physical',
    is_coupon_enabled: true,
    kenyon_price: 49,
    full_price: 89,
    images: ['https://cdn.test/pizza.webp'],
    stock_quantity: 5,
    category_id: 'c1',
    supplier_id: 's1',
    city: 'תל אביב',
    tags: ['deal'],
    created_at: '2026-09-01T00:00:00.000Z',
    categories: { name_he: 'מסעדות', slug: 'restaurants-cafes' },
  },
  {
    id: 'p2',
    slug: 'sushi',
    name_he: 'סושי',
    type: 'physical',
    is_coupon_enabled: false,
    kenyon_price: 120,
    full_price: 150,
    images: 'not-an-array',
    stock_quantity: 0,
    categories: [{ name_he: 'מסעדות', slug: 'restaurants-cafes' }],
  },
  {
    id: 'p3',
    slug: 'spa',
    name_he: 'ספא זוגי',
    type: 'coupon',
    kenyon_price: 300,
    full_price: null,
    images: [],
    stock_quantity: null,
    categories: null,
  },
]

const BASE = { q: '', limit: 24, offset: 0 }

beforeEach(() => {
  dbResult.data = ROWS
  dbResult.error = null
  chains.length = 0
  logInfo.mockReset()
  logError.mockReset()
  vi.stubEnv('MEILISEARCH_HOST', '')
  vi.stubEnv('MEILISEARCH_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the database engine', () => {
  it('reads active, undeleted rows, one or-group per word, within the window', async () => {
    const outcome = await facetedSearch({ ...BASE, q: 'פיצה  משפחתית' })
    expect('error' in outcome).toBe(false)

    const chain = chains[0] as [string, unknown[]][]
    expect(chain[0]).toEqual(['from', ['products']])
    expect(chain.find(([m]) => m === 'eq')).toEqual(['eq', ['status', 'active']])
    expect(chain.find(([m]) => m === 'is')).toEqual(['is', ['deleted_at', null]])
    expect(chain.filter(([m]) => m === 'or').map(([, a]) => a[0])).toEqual([
      'name_he.ilike.%פיצה%,description_he.ilike.%פיצה%',
      'name_he.ilike.%משפחתית%,description_he.ilike.%משפחתית%',
    ])
    expect(chain.at(-1)).toEqual(['limit', [500]])
  })

  it('sanitises the query so a term cannot append its own PostgREST conditions', async () => {
    const q = 'a,b(c)"d\\e%f_g*h'
    const outcome = await facetedSearch({ ...BASE, q })
    expect((outcome as { query: string }).query).toBe('a b c d e f g h')
    const chain = chains[0] as [string, unknown[]][]
    for (const [, args] of chain.filter(([m]) => m === 'or')) {
      expect(String(args[0])).not.toMatch(/[,()"\\%_*].*ilike.*[()"\\]/)
    }
  })

  it('caps the word list at eight', async () => {
    await facetedSearch({ ...BASE, q: 'a b c d e f g h i j' })
    const chain = chains[0] as [string, unknown[]][]
    expect(chain.filter(([m]) => m === 'or')).toHaveLength(8)
  })

  it('maps rows to hits and computes facets from the filtered set', async () => {
    const outcome = await facetedSearch(BASE)
    if ('error' in outcome) throw new Error(outcome.error)

    expect(outcome.engine).toBe('database')
    expect(outcome.total).toBe(3)
    expect(outcome.results.map((h) => h.id)).toEqual(['p1', 'p2', 'p3'])
    expect(outcome.results[0]).toEqual({
      id: 'p1',
      slug: 'pizza',
      name_he: 'פיצה משפחתית',
      kenyon_price: 49,
      full_price: 89,
      image: 'https://cdn.test/pizza.webp',
      images: ['https://cdn.test/pizza.webp'],
      stock_quantity: 5,
      category: 'מסעדות',
      category_slug: 'restaurants-cafes',
      brand: 'דומינוס',
      // Coupon-enabled reads as a coupon, the same rule the cart applies.
      type: 'coupon',
      in_stock: true,
    })
    expect(outcome.results[1]).toMatchObject({ image: null, in_stock: false, brand: null })
    expect(outcome.results[2]).toMatchObject({
      category: null,
      category_slug: null,
      in_stock: true,
    })
    expect(outcome.facets.type).toEqual({ coupon: 2, physical: 1 })
    expect(outcome.facets.in_stock).toEqual({ true: 2, false: 1 })
  })

  it('applies facet filters, sorting and paging with the shared helpers', async () => {
    const outcome = await facetedSearch({
      ...BASE,
      inStock: true,
      sort: 'price_desc',
      limit: 1,
      offset: 1,
    })
    if ('error' in outcome) throw new Error(outcome.error)
    expect(outcome.total).toBe(2)
    expect(outcome.results.map((h) => h.id)).toEqual(['p1'])
    expect(outcome.facets.type).toEqual({ coupon: 2 })
  })

  it('answers search_failed on a query error and logs the upstream reason', async () => {
    dbResult.error = { message: 'permission denied for table products' }
    expect(await facetedSearch(BASE)).toEqual({ error: 'search_failed' })
    expect(logError).toHaveBeenCalledWith('search.facets_query_failed', {
      reason: 'permission denied for table products',
    })
    expect(logInfo).not.toHaveBeenCalled()
  })

  it('emits one search.executed line naming the engine and the active facets', async () => {
    // The word match is PostgREST's job; the fake returns every row, so the
    // count here is what the shared facet filter keeps: the two restaurants.
    await facetedSearch({ ...BASE, q: 'סושי', category: 'restaurants-cafes', priceMax: 200 })
    expect(logInfo).toHaveBeenCalledTimes(1)
    expect(logInfo).toHaveBeenCalledWith('search.executed', {
      engine: 'database',
      hits: 2,
      ms: expect.any(Number),
      query_length: 4,
      facets: ['category', 'price'],
    })
  })
})

describe('the Meilisearch engine', () => {
  const HIT = {
    id: 'm1',
    slug: 'falafel',
    name_he: 'פלאפל',
    name_en: null,
    brand: null,
    short_description_he: null,
    description_he: null,
    sku: null,
    type: 'physical',
    kenyon_price: 20,
    full_price: 25,
    images: ['https://cdn.test/f.webp'],
    stock_quantity: 3,
    in_stock: true,
    category_id: 'c1',
    category_slug: 'restaurants-cafes',
    category_name_he: 'מסעדות',
    supplier_id: null,
    supplier_name: null,
    city: null,
    tags: [],
  }

  function meiliAnswering(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    vi.stubEnv('MEILISEARCH_HOST', 'https://meili.test/')
    vi.stubEnv('MEILISEARCH_API_KEY', 'meili-key')
  })

  it('POSTs the search with the bearer, filters, facets, sort and locales', async () => {
    const fetchMock = meiliAnswering(200, {
      hits: [HIT],
      estimatedTotalHits: 40,
      facetDistribution: { type: { physical: 40 } },
    })

    const outcome = await facetedSearch({
      ...BASE,
      q: 'פלאפל',
      type: 'physical',
      city: 'תל אביב',
      sort: 'price_asc',
      offset: 24,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://meili.test/indexes/products/search')
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer meili-key',
    })
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.q).toBe('פלאפל')
    expect(body.limit).toBe(24)
    expect(body.offset).toBe(24)
    expect(body.facets).toEqual(['type', 'category_slug', 'city', 'brand', 'tags', 'in_stock'])
    expect(body.filter).toEqual(expect.arrayContaining([expect.stringContaining('type = ')]))
    expect(body.sort).toEqual(['kenyon_price:asc'])
    expect(body.locales).toEqual(['heb'])

    expect(outcome).toEqual({
      query: 'פלאפל',
      results: [
        {
          id: 'm1',
          slug: 'falafel',
          name_he: 'פלאפל',
          kenyon_price: 20,
          full_price: 25,
          image: 'https://cdn.test/f.webp',
          images: ['https://cdn.test/f.webp'],
          stock_quantity: 3,
          category: 'מסעדות',
          category_slug: 'restaurants-cafes',
          brand: null,
          type: 'physical',
          in_stock: true,
        },
      ],
      total: 40,
      facets: { type: { physical: 40 } },
      engine: 'meilisearch',
    })
    expect(chains).toHaveLength(0)
    expect(logInfo).toHaveBeenCalledWith(
      'search.executed',
      expect.objectContaining({ engine: 'meilisearch', hits: 40, facets: ['type', 'city'] }),
    )
  })

  it('defaults the total to the hit count and the facets to empty, and omits sort and locales', async () => {
    const fetchMock = meiliAnswering(200, { hits: [HIT] })
    const outcome = await facetedSearch({ ...BASE, q: 'abc' })
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    )
    expect(body).not.toHaveProperty('sort')
    expect(body.locales).toEqual(['eng'])
    expect(outcome).toMatchObject({ total: 1, facets: {}, engine: 'meilisearch' })

    meiliAnswering(200, {})
    expect(await facetedSearch(BASE)).toMatchObject({
      total: 0,
      results: [],
      engine: 'meilisearch',
    })
  })

  it('falls back to the database when Meilisearch answers non-2xx or throws', async () => {
    meiliAnswering(503, {})
    expect(await facetedSearch(BASE)).toMatchObject({ engine: 'database', total: 3 })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )
    expect(await facetedSearch(BASE)).toMatchObject({ engine: 'database', total: 3 })
  })

  it('is off when only one of host and key is set', async () => {
    vi.stubEnv('MEILISEARCH_API_KEY', '')
    const fetchMock = meiliAnswering(200, { hits: [HIT] })
    expect(await facetedSearch(BASE)).toMatchObject({ engine: 'database' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('activeFacetNames', () => {
  it('names every narrowing facet once, price for either bound', () => {
    expect(activeFacetNames(BASE)).toEqual([])
    expect(
      activeFacetNames({
        ...BASE,
        type: 'coupon',
        category: 'c',
        city: 'x',
        brand: 'b',
        tag: 't',
        inStock: false,
        priceMin: 1,
      }),
    ).toEqual(['type', 'category', 'city', 'brand', 'tag', 'in_stock', 'price'])
    expect(activeFacetNames({ ...BASE, priceMax: 5 })).toEqual(['price'])
  })
})

describe('facetedSearchCached', () => {
  it('answers the parser error for invalid params without running a search', async () => {
    expect(await facetedSearchCached(new URLSearchParams('type=bogus'))).toEqual({
      error: 'invalid_type',
    })
    expect(chains).toHaveLength(0)
  })

  it('runs the same search the API would for the URL', async () => {
    const outcome = await facetedSearchCached(new URLSearchParams('sort=price_desc&q=x&limit=2'))
    if ('error' in outcome) throw new Error(outcome.error)
    expect(outcome.engine).toBe('database')
    expect(outcome.results.map((h) => h.id)).toEqual(['p3', 'p2'])
  })
})
