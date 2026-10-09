import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Meilisearch rebuild, end to end against a fake engine.
 *
 * `syncCatalogue` is what /api/cron/search-reindex runs every hour, and it is
 * the only path that can REMOVE a document: the incremental indexer and the
 * outbox drain only ever upsert. So the properties pinned here are the ones
 * nothing else guarantees: every catalogue row is PUT, the settings are
 * PATCHed every run (a settings change lands on an existing index), a ghost
 * in the index is deleted, the coupons index is pruned by the coupon subset
 * and not by the whole catalogue, and the delete is enqueued AFTER the PUT so
 * an empty index is filled before anything could blank it.
 */

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { syncCatalogue } from './meilisearch'

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {}
  const p = Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  for (const m of ['select', 'eq', 'is', 'order', 'range']) c[m] = () => c
  // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable like the real one
  c.then = p.then.bind(p)
  return c
}

const CATALOGUE = [
  {
    id: 'phys',
    slug: 'phys',
    name_he: 'מוצר',
    type: 'physical',
    is_coupon_enabled: false,
    kenyon_price: 10,
    full_price: 20,
    images: [],
    stock_quantity: 3,
    category_id: null,
    supplier_id: null,
    created_at: '2026-09-01T00:00:00Z',
    categories: null,
  },
  {
    id: 'coup',
    slug: 'coup',
    name_he: 'קופון',
    type: 'coupon',
    is_coupon_enabled: true,
    kenyon_price: 5,
    full_price: 50,
    images: [],
    stock_quantity: null,
    category_id: null,
    supplier_id: null,
    created_at: '2026-09-01T00:00:00Z',
    categories: null,
  },
]

type Call = { method: string; path: string; body?: unknown }

/** A fake Meilisearch: records every call, answers by path, seeds index ids. */
function fakeEngine(indexed: Record<string, string[]>) {
  const calls: Call[] = []
  let task = 100
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('https://meili.test', '')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ method, path, body })
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    if (path === '/indexes' && method === 'POST') return json({ taskUid: task++ })
    if (/\/settings$/.test(path)) return json({ taskUid: task++ })
    if (/\/documents\?primaryKey=id$/.test(path) && method === 'PUT')
      return json({ taskUid: task++ })
    if (/\/documents\/delete-batch$/.test(path)) return json({ taskUid: task++ })
    const listed = path.match(/^\/indexes\/([^/]+)\/documents\?fields=id/)
    if (listed && method === 'GET') {
      const ids = indexed[listed[1]!] ?? []
      return json({ results: ids.map((id) => ({ id })), total: ids.length })
    }
    return json({ message: `unhandled ${method} ${path}` }, 500)
  })
  return { calls, fetchMock }
}

describe('syncCatalogue', () => {
  beforeEach(() => {
    vi.stubEnv('MEILISEARCH_HOST', 'https://meili.test')
    vi.stubEnv('MEILISEARCH_API_KEY', 'k')
    from.mockReset().mockImplementation((table: string) => {
      if (table === 'suppliers') return chain({ data: [] })
      if (table === 'products') return chain({ data: CATALOGUE })
      throw new Error(`unexpected table ${table}`)
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is a successful no-op while the engine is unconfigured', async () => {
    vi.stubEnv('MEILISEARCH_HOST', '')
    const { fetchMock } = fakeEngine({})
    vi.stubGlobal('fetch', fetchMock)
    expect(await syncCatalogue()).toEqual({
      skipped: true,
      products: 0,
      coupons: 0,
      taskUids: [],
      pruned: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('PUTs the whole catalogue to products and the coupon subset to coupons, settings first', async () => {
    const { calls, fetchMock } = fakeEngine({ products: ['phys', 'coup'], coupons: ['coup'] })
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncCatalogue()

    expect(result).toMatchObject({ skipped: false, products: 2, coupons: 1, pruned: 0 })
    const puts = calls.filter((c) => c.method === 'PUT')
    expect(puts.map((c) => c.path)).toEqual([
      '/indexes/products/documents?primaryKey=id',
      '/indexes/coupons/documents?primaryKey=id',
    ])
    expect((puts[0]!.body as { id: string }[]).map((d) => d.id)).toEqual(['phys', 'coup'])
    expect((puts[1]!.body as { id: string }[]).map((d) => d.id)).toEqual(['coup'])
    // Settings are PATCHed on every run, not only on create, so a changed
    // ranking rule reaches an index that already exists.
    const settingsPatches = calls.filter((c) => c.method === 'PATCH' && /\/settings$/.test(c.path))
    expect(settingsPatches.map((c) => c.path)).toContain('/indexes/products/settings')
    expect(settingsPatches.map((c) => c.path)).toContain('/indexes/coupons/settings')
    expect(calls.findIndex((c) => c.method === 'PATCH')).toBeLessThan(
      calls.findIndex((c) => c.method === 'PUT'),
    )
    expect(calls.filter((c) => /delete-batch/.test(c.path))).toEqual([])
  })

  it('deletes the ghosts: ids the catalogue no longer has, per index, after the PUTs', async () => {
    const { calls, fetchMock } = fakeEngine({
      products: ['phys', 'coup', 'ghost-1', 'ghost-2'],
      // `phys` is in the coupons index by mistake: it is a product, not a
      // coupon, so the coupon prune must remove it even though the catalogue
      // still has it.
      coupons: ['coup', 'phys', 'ghost-3'],
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncCatalogue()

    expect(result.pruned).toBe(4)
    const deletes = calls.filter((c) => /delete-batch/.test(c.path))
    expect(deletes).toEqual([
      {
        method: 'POST',
        path: '/indexes/products/documents/delete-batch',
        body: ['ghost-1', 'ghost-2'],
      },
      {
        method: 'POST',
        path: '/indexes/coupons/documents/delete-batch',
        body: ['phys', 'ghost-3'],
      },
    ])
    const lastPut = calls.map((c) => c.method).lastIndexOf('PUT')
    const firstDelete = calls.findIndex((c) => /delete-batch/.test(c.path))
    expect(firstDelete).toBeGreaterThan(lastPut)
    // The delete tasks are appended after the PUT tasks, in order.
    expect(result.taskUids).toHaveLength(4)
  })

  it('throws when the catalogue cannot be read, so the route answers 500', async () => {
    from.mockImplementation((table: string) =>
      table === 'suppliers' ? chain({ data: [] }) : chain({ error: { message: 'boom' } }),
    )
    const { fetchMock } = fakeEngine({})
    vi.stubGlobal('fetch', fetchMock)
    await expect(syncCatalogue()).rejects.toThrow(/products read failed: boom/)
  })

  it('throws when the engine refuses a write, rather than reporting a partial sync as done', async () => {
    const { fetchMock } = fakeEngine({})
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('index is locked', { status: 503 })
      return new Response(JSON.stringify({ taskUid: 1 }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(syncCatalogue()).rejects.toThrow(/503/)
  })
})
