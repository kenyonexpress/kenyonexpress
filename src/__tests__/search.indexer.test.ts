import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The indexer talks to two externals: Supabase (via createAdminClient) and
 * Meilisearch (via fetch). Both are mocked; the tests pin the DECISIONS —
 * what gets read, what gets pushed, when an upsert degrades to a delete, and
 * that failures throw (so QStash retries).
 */

const PRODUCT_ID = '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a'
const SUPPLIER_ID = '9f8e7d6c-5b4a-3c2d-1e0f-a1b2c3d4e5f6'

const upsertJob: SearchIndexJob = {
  op: 'upsert',
  productId: PRODUCT_ID,
  reason: 'update:active',
  enqueuedAt: '2026-07-27T10:00:00.000Z',
}

const activeRow = {
  id: PRODUCT_ID,
  slug: 'spa-day',
  name_he: 'יום ספא',
  name_en: 'Spa Day',
  brand: null,
  short_description_he: null,
  description_he: 'פינוק',
  sku: 'SPA-1',
  type: 'coupon',
  status: 'active',
  deleted_at: null,
  is_coupon_enabled: true,
  kenyon_price: 199,
  full_price: 299,
  images: ['a.jpg'],
  stock_quantity: null,
  category_id: null,
  supplier_id: SUPPLIER_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  categories: null,
}

// --- Supabase admin mock ------------------------------------------------
let productRow: Record<string, unknown> | null = null
let productError: { message: string } | null = null

function tableMock(table: string) {
  const single =
    table === 'products'
      ? { data: productRow, error: productError }
      : {
          data: productRow?.supplier_id ? { name: 'ספק הצפון' } : null,
          error: null,
        }
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(single) }),
    }),
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => tableMock(table) }),
}))

const { runSearchIndexJob } = await import('@/lib/search/indexer')

// --- Meilisearch fetch mock ----------------------------------------------
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('MEILISEARCH_HOST', 'http://meili.local')
  vi.stubEnv('MEILISEARCH_API_KEY', 'meili-key')
  productRow = { ...activeRow }
  productError = null
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('runSearchIndexJob', () => {
  it('is a successful no-op when Meilisearch is not configured', async () => {
    vi.stubEnv('MEILISEARCH_HOST', '')
    const outcome = await runSearchIndexJob(upsertJob)
    expect(outcome).toContain('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-reads the row and PUTs the mapped document', async () => {
    const outcome = await runSearchIndexJob(upsertJob)
    expect(outcome).toBe(`upserted ${PRODUCT_ID}`)

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === 'PUT')
    expect(put).toBeDefined()
    const [url, init] = put as [string, RequestInit]
    // `?primaryKey=id` is part of the contract, not decoration: on an index
    // that does not exist yet Meilisearch INFERS the primary key from the
    // first document, and it picks whichever field it likes that ends in
    // "id". Declaring it makes the first write deterministic.
    expect(url).toBe('http://meili.local/indexes/products/documents?primaryKey=id')
    const [doc] = JSON.parse((init as { body: string }).body)
    expect(doc).toMatchObject({
      id: PRODUCT_ID,
      name_he: 'יום ספא',
      type: 'coupon',
      in_stock: true,
      supplier_name: 'ספק הצפון',
    })
    // `status` IS indexed, and is filterable - see FILTERABLE_ATTRIBUTES in
    // meili-settings.ts for why. It is not a secret: every document in the
    // index is a publicly readable, active product, so the field can only ever
    // read 'active', and a document that says anything else is drift a caller
    // can now filter out instead of ranking.
    expect(doc.status).toBe('active')
    // `deleted_at` stays out. That one is a gate column with no read-side use:
    // a soft-deleted product is DELETED from the index, never written with a
    // timestamp, so indexing the field would only make it possible to publish
    // a document that contradicts its own presence.
    expect(doc).not.toHaveProperty('deleted_at')
  })

  it('turns a stale upsert into a delete when the row is gone', async () => {
    productRow = null
    const outcome = await runSearchIndexJob(upsertJob)
    expect(outcome).toContain('stale upsert')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(url).toBe(`http://meili.local/indexes/products/documents/${PRODUCT_ID}`)
  })

  it('turns a stale upsert into a delete when the row fell out of the predicate', async () => {
    productRow = { ...activeRow, status: 'paused' }
    expect(await runSearchIndexJob(upsertJob)).toContain('stale upsert')

    productRow = { ...activeRow, deleted_at: '2026-07-27T09:00:00.000Z' }
    expect(await runSearchIndexJob(upsertJob)).toContain('stale upsert')
  })

  it('deletes directly for a delete job without touching the database', async () => {
    const outcome = await runSearchIndexJob({ ...upsertJob, op: 'delete' })
    expect(outcome).toBe(`deleted ${PRODUCT_ID}`)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE')
  })

  it('treats 404 on delete as success (idempotent)', async () => {
    fetchMock.mockResolvedValue(new Response('missing', { status: 404 }))
    await expect(runSearchIndexJob({ ...upsertJob, op: 'delete' })).resolves.toContain('deleted')
  })

  it('throws when Meilisearch rejects, so the queue retries', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(runSearchIndexJob(upsertJob)).rejects.toThrow('meilisearch')
  })

  it('throws when the product read fails, so the queue retries', async () => {
    productError = { message: 'connection refused' }
    await expect(runSearchIndexJob(upsertJob)).rejects.toThrow('products read failed')
  })
})
