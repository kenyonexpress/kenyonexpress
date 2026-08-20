import {
  MeiliError,
  buildFilter,
  deleteDocument,
  meiliConfig,
  meiliConfigured,
  quoteFilterValue,
  searchIndex,
  upsertDocuments,
} from '@/lib/search/client'
import type { ProductDocument } from '@/lib/search/meili-settings'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Meilisearch client, with the engine mocked at `fetch`.
 *
 * What is pinned here is the pair of error contracts, because they are
 * opposites and getting them the wrong way round fails silently in both
 * directions: a read that throws takes down a shopper's search page over an
 * engine hiccup, and a write that swallows leaves a product unsearchable
 * forever with nothing in the logs.
 */

/**
 * The environment is driven with `vi.stubEnv`, never with assignment.
 * `process.env.X = undefined` stores the STRING "undefined", which is truthy,
 * so every "not configured" case below would silently run against a host
 * literally named undefined. `vi.stubEnv(name, undefined)` removes the key.
 */
const HOST = 'http://meili.local'
const KEY = 'test-key'

function doc(id: string): ProductDocument {
  return {
    id,
    slug: 'spa-day',
    name_he: 'יום ספא',
    name_en: null,
    brand: null,
    short_description_he: null,
    description_he: null,
    sku: null,
    type: 'coupon',
    kenyon_price: 199,
    full_price: 299,
    images: [],
    stock_quantity: null,
    in_stock: true,
    status: 'active',
    category_id: null,
    category_slug: null,
    category_name_he: null,
    supplier_id: null,
    supplier_name: null,
    city: null,
    tags: [],
    created_at: null,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response)
}

beforeEach(() => {
  vi.stubEnv('MEILISEARCH_HOST', HOST)
  vi.stubEnv('MEILISEARCH_API_KEY', KEY)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('meiliConfig', () => {
  it('is null until both variables are set', () => {
    vi.stubEnv('MEILISEARCH_HOST', undefined)
    expect(meiliConfig()).toBeNull()
    expect(meiliConfigured()).toBe(false)

    process.env.MEILISEARCH_HOST = HOST
    vi.stubEnv('MEILISEARCH_API_KEY', undefined)
    expect(meiliConfig()).toBeNull()
  })

  it('strips trailing slashes so no URL is built with a double slash', () => {
    vi.stubEnv('MEILISEARCH_HOST', `${HOST}///`)
    expect(meiliConfig()?.host).toBe(HOST)
  })
})

describe('searchIndex', () => {
  it('ANDs the filter expressions instead of passing the array', async () => {
    // An array of filters means OR in Meilisearch. Sent as an array, a shopper
    // who picks "coupons" AND "Haifa" would get the union of the two, which is
    // more results after narrowing - the one outcome a filter must never have.
    respond(200, { hits: [], estimatedTotalHits: 0 })
    await searchIndex({
      q: 'ספא',
      limit: 10,
      filter: ['type = "coupon"', 'city = "חיפה"'],
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).filter).toBe('type = "coupon" AND city = "חיפה"')
  })

  it('omits filter, sort and facets entirely when there are none', async () => {
    respond(200, { hits: [], estimatedTotalHits: 0 })
    await searchIndex({ q: 'ספא', limit: 10, filter: [], sort: [] })
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('filter')
    expect(body).not.toHaveProperty('sort')
    expect(body).not.toHaveProperty('facets')
  })

  it('returns null rather than throwing when the engine rejects the query', async () => {
    respond(400, { message: 'invalid filter' })
    expect(await searchIndex({ q: 'ספא', limit: 10 })).toBeNull()
  })

  it('returns null when the engine is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await searchIndex({ q: 'ספא', limit: 10 })).toBeNull()
  })

  it('returns null without a request when the engine is not configured', async () => {
    vi.stubEnv('MEILISEARCH_HOST', undefined)
    expect(await searchIndex({ q: 'ספא', limit: 10 })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the hit count when the engine omits the estimate', async () => {
    respond(200, { hits: [{ id: 'a', slug: 'a', name_he: 'א' }] })
    const result = await searchIndex({ q: 'ספא', limit: 10 })
    expect(result?.estimatedTotalHits).toBe(1)
  })
})

describe('write path', () => {
  it('declares the primary key on upsert and uses PUT', async () => {
    respond(202, { taskUid: 1 })
    await upsertDocuments([doc('a')])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${HOST}/indexes/products/documents?primaryKey=id`)
    expect(init.method).toBe('PUT')
  })

  it('sends nothing for an empty batch', async () => {
    await upsertDocuments([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('THROWS when the engine refuses a write, so the job is retried', async () => {
    respond(500, { message: 'boom' })
    await expect(upsertDocuments([doc('a')])).rejects.toBeInstanceOf(MeiliError)
  })

  it('treats a 404 on delete as success, so a redelivery cannot dead-letter', async () => {
    respond(404, {})
    await expect(deleteDocument('a')).resolves.toBeUndefined()
  })

  it('throws on any other delete failure', async () => {
    respond(503, {})
    await expect(deleteDocument('a')).rejects.toBeInstanceOf(MeiliError)
  })

  it('encodes the id into the path', async () => {
    respond(202, {})
    await deleteDocument('a/../b')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${HOST}/indexes/products/documents/a%2F..%2Fb`)
  })

  it('is a silent no-op when the engine is not configured', async () => {
    vi.stubEnv('MEILISEARCH_API_KEY', undefined)
    await upsertDocuments([doc('a')])
    await deleteDocument('a')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('quoteFilterValue', () => {
  it('quotes a Hebrew city, which is otherwise a syntax error', () => {
    expect(quoteFilterValue('תל אביב')).toBe('"תל אביב"')
  })

  it('escapes the quote before it can close the string', () => {
    expect(quoteFilterValue('x" OR id EXISTS')).toBe('"x\\" OR id EXISTS"')
  })

  it('escapes backslashes first, so a trailing one cannot escape the closer', () => {
    expect(quoteFilterValue('x\\')).toBe('"x\\\\"')
  })
})

describe('buildFilter', () => {
  it('produces nothing when nothing was asked for', () => {
    expect(buildFilter({})).toEqual([])
  })

  it('never emits a bound for an absent price', () => {
    // `kenyon_price >= 0` is not a no-op: it drops every product whose price is
    // NULL, which is most of the coupon catalogue.
    expect(buildFilter({ priceMin: null, priceMax: undefined })).toEqual([])
    expect(buildFilter({ priceMin: Number.NaN })).toEqual([])
  })

  it('builds the full set', () => {
    expect(
      buildFilter({
        type: 'coupon',
        categorySlug: 'spa',
        city: 'חיפה',
        priceMin: 50,
        priceMax: 200,
        inStockOnly: true,
      }),
    ).toEqual([
      'category_slug = "spa"',
      'city = "חיפה"',
      'type = "coupon"',
      'kenyon_price >= 50',
      'kenyon_price <= 200',
      'in_stock = true',
    ])
  })
})
