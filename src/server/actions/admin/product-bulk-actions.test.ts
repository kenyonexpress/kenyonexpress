import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The server half of the scoped bulk edit. Planning is proven in
 * lib/admin/product-bulk; what can only fail here is the database-touching
 * part: the scope becomes the right filters, the preview writes nothing, the
 * admin tier is enforced, R2 keys become allowlisted URLs (or a refusal),
 * a batch writes exactly the planned columns and journals their prior
 * values on the run, and a mid-batch failure restores what it wrote.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  const record: Call = { table, op, payload, chain: [] }
  calls.push(record)
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const client = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    update: (payload: unknown) => builder(table, 'update', payload),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    delete: () => builder(table, 'delete'),
  }),
}

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()
const isR2StorageConfigured = vi.fn()
const listR2Objects = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  updateTag: (t: string) => updateTag(t),
}))
vi.mock('@/lib/storage/r2-service', () => ({
  isR2StorageConfigured: () => isR2StorageConfigured(),
  listR2Objects: (...args: unknown[]) => listR2Objects(...args),
  r2ObjectPublicUrl: (_purpose: string, key: string) =>
    `${(process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')}/${key}`,
}))

const { applyProductBulkBatch, previewProductBulkEdit, startProductBulkRun } = await import(
  './product-bulk'
)

const ADMIN = { userId: 'admin-1', role: 'admin' as const }
const RUN = '22222222-2222-4222-8222-222222222222'

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'shoe',
    name_he: 'נעל ספורט',
    name_en: null,
    sku: 'AB-100',
    type: 'physical',
    status: 'active',
    kenyon_price: 100,
    full_price: 150,
    coupon_price_ils: null,
    discount_percent: null,
    stock_quantity: 10,
    description_he: null,
    short_description_he: null,
    brand: 'Nike',
    seo_title: null,
    seo_description: null,
    images: [],
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const SECOND = product({
  id: '33333333-3333-4333-8333-333333333333',
  slug: 'bag',
  sku: 'CD-7',
  brand: 'Puma',
})

beforeEach(() => {
  calls.length = 0
  queues.clear()
  vi.clearAllMocks()
  requireAdminSession.mockResolvedValue(ADMIN)
  isR2StorageConfigured.mockReturnValue(true)
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.kenyonexpress.co.il'
})

describe('previewProductBulkEdit', () => {
  it('refuses anything below the admin tier, before touching the database', async () => {
    requireAdminSession.mockRejectedValue(new Error('no'))
    const res = await previewProductBulkEdit({}, { kind: 'stock', mode: 'set', value: 1 })
    expect(res.error).toBe('אין הרשאה')
    expect(calls).toHaveLength(0)
    expect(
      (
        await applyProductBulkBatch(['11111111-1111-4111-8111-111111111111'], {
          kind: 'stock',
          mode: 'set',
          value: 1,
        })
      ).error,
    ).toBe('אין הרשאה')
    expect(calls).toHaveLength(0)
  })

  it('refuses a malformed operation and scope with the schema message', async () => {
    expect((await previewProductBulkEdit({}, { kind: 'price', mode: 'set', value: 0 })).error).toBe(
      'המחיר חייב להיות חיובי',
    )
    expect(
      (await previewProductBulkEdit({ status: 'live' }, { kind: 'stock', mode: 'set', value: 1 }))
        .error,
    ).toBeTruthy()
  })

  it('turns the scope into filters, plans every row, and writes nothing', async () => {
    queue('products.select', {
      data: [
        product(),
        SECOND,
        product({ id: '44444444-4444-4444-8444-444444444444', slug: 'c', type: 'coupon' }),
      ],
      error: null,
    })
    const res = await previewProductBulkEdit(
      { skuPattern: 'AB-*', q: 'נעל', status: 'active', type: '', categoryId: '' },
      { kind: 'stock', mode: 'delta', value: -25 },
    )
    expect(res.error).toBeUndefined()

    const select = calls.find((c) => c.table === 'products' && c.op === 'select')
    expect(select?.chain).toEqual(
      expect.arrayContaining([
        ['is', ['deleted_at', null]],
        ['ilike', ['sku', 'AB-%']],
        ['ilike', ['name_he', '%נעל%']],
        ['eq', ['status', 'active']],
      ]),
    )
    // Blank type and category are "any", not eq('type', '').
    expect(select?.chain.filter(([m]) => m === 'eq')).toEqual([['eq', ['status', 'active']]])

    expect(res.summary).toEqual({
      matched: 3,
      changes: 2,
      skipped: 1,
      unchanged: 0,
      scopeTruncated: false,
    })
    expect(res.changeIds).toEqual([product().id, SECOND.id])
    expect(res.label).toBe('מלאי -25 · מק"ט AB-* · שם מכיל "נעל" · פעיל')
    expect(res.rows?.[0]).toMatchObject({
      status: 'change',
      before: { stock_quantity: 10 },
      after: { stock_quantity: 0 },
    })
    expect(res.rows?.[2]).toMatchObject({ status: 'skip', reason: 'למוצר הזה אין מלאי פיזי' })
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('images: refuses when R2 is not configured', async () => {
    isR2StorageConfigured.mockReturnValue(false)
    queue('products.select', { data: [product()], error: null })
    const res = await previewProductBulkEdit(
      {},
      { kind: 'images', mode: 'replace', prefix: 'catalog/' },
    )
    expect(res.error).toMatch(/R2 לא מוגדר/)
    expect(listR2Objects).not.toHaveBeenCalled()
  })

  it('images: refuses a CDN host outside the image allowlist rather than writing it', async () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://pub-123.example.com'
    queue('products.select', { data: [product()], error: null })
    listR2Objects.mockResolvedValue({ keys: ['catalog/AB-100.jpg'], truncated: false })
    const res = await previewProductBulkEdit(
      {},
      { kind: 'images', mode: 'replace', prefix: 'catalog/' },
    )
    expect(res.error).toMatch(/אינה ברשימת המארחים המותרים/)
  })

  it('images: lists the prefix, matches keys to skus and reports the listing', async () => {
    queue('products.select', { data: [product(), SECOND], error: null })
    listR2Objects.mockResolvedValue({
      keys: ['catalog/AB-100.jpg', 'catalog/AB-100-1.webp', 'catalog/ZZ.jpg'],
      truncated: true,
    })
    const res = await previewProductBulkEdit(
      {},
      { kind: 'images', mode: 'replace', prefix: 'catalog/' },
    )
    expect(res.error).toBeUndefined()
    expect(listR2Objects).toHaveBeenCalledWith('product-images', 'catalog/')
    expect(res.summary).toMatchObject({
      matched: 2,
      changes: 1,
      skipped: 1,
      r2Keys: 3,
      r2Truncated: true,
    })
    expect(res.rows?.[0]).toMatchObject({
      status: 'change',
      after: {
        images: [
          'https://cdn.kenyonexpress.co.il/catalog/AB-100.jpg',
          'https://cdn.kenyonexpress.co.il/catalog/AB-100-1.webp',
        ],
      },
    })
  })
})

describe('startProductBulkRun', () => {
  it('opens the run on the import entity, tagged bulk, with the label and counts', async () => {
    const res = await startProductBulkRun(
      { kind: 'price', mode: 'percent', value: 10 },
      { label: 'מחירים +10% · כל המוצרים', summary: { matched: 5, changes: 4, skipped: 1 } },
    )
    expect(res.runId).toMatch(/^[0-9a-f-]{36}$/)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'created',
        entityType: 'product_import_run',
        entityId: res.runId,
        changes: expect.objectContaining({
          kind: 'bulk',
          file_name: 'מחירים +10% · כל המוצרים',
          mode: 'upsert',
          total: 5,
          valid: 4,
          invalid: 1,
          updates: 4,
        }),
      }),
    )
  })
})

describe('applyProductBulkBatch', () => {
  it('re-reads the ids, writes the planned columns and journals their prior values on the run', async () => {
    queue('products.select', { data: [product(), SECOND], error: null })
    const res = await applyProductBulkBatch(
      [product().id, SECOND.id],
      { kind: 'replace', field: 'brand', find: 'Nike', replace: 'Adidas' },
      { id: RUN, batch: 2 },
    )
    expect(res.error).toBeUndefined()
    expect(res).toMatchObject({ updated: 1, skipped: 1 })

    const updates = calls.filter((c) => c.table === 'products' && c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0]?.payload).toEqual({ brand: 'Adidas' })
    expect(updates[0]?.chain).toEqual([['eq', ['id', product().id]]])

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updated',
        entityType: 'product_import_run',
        entityId: RUN,
        changes: expect.objectContaining({
          kind: 'bulk',
          batch: 2,
          inserted: 0,
          updated: 1,
          skipped: 1,
        }),
        before: { inserts: [], updates: [{ id: product().id, prior: { brand: 'Nike' } }] },
      }),
    )
    expect(updateTag).toHaveBeenCalled()
    expect(res.results).toEqual([
      { id: product().id, slug: 'shoe', name: 'נעל ספורט', errors: [] },
      { id: SECOND.id, slug: 'bag', name: 'נעל ספורט', errors: ['ללא שינוי (השתנה מאז הבדיקה)'] },
    ])
  })

  it('restores what it wrote when a later row fails, and journals nothing', async () => {
    queue('products.select', { data: [product(), SECOND], error: null })
    queue(
      'products.update',
      { data: null, error: null },
      { data: null, error: { message: 'boom' } },
      { data: null, error: null },
    )
    const res = await applyProductBulkBatch(
      [product().id, SECOND.id],
      { kind: 'stock', mode: 'set', value: 0 },
      { id: RUN, batch: 1 },
    )
    expect(res.error).toBe('bag: boom - כל השינויים בקבוצה בוטלו (rollback)')

    const updates = calls.filter((c) => c.table === 'products' && c.op === 'update')
    expect(updates.map((u) => u.payload)).toEqual([
      { stock_quantity: 0 },
      { stock_quantity: 0 },
      { stock_quantity: 10 },
    ])
    expect(updates[2]?.chain).toEqual([['eq', ['id', product().id]]])
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('refuses an empty, oversized or malformed id list', async () => {
    expect((await applyProductBulkBatch([], { kind: 'stock', mode: 'set', value: 1 })).error).toBe(
      'לא התקבלו מוצרים לעדכון',
    )
    expect(
      (await applyProductBulkBatch(['nope'], { kind: 'stock', mode: 'set', value: 1 })).error,
    ).toBe('לא התקבלו מוצרים לעדכון')
    const many = Array.from(
      { length: 101 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    )
    expect(
      (await applyProductBulkBatch(many, { kind: 'stock', mode: 'set', value: 1 })).error,
    ).toBe('כל קבוצה מוגבלת ל-100 מוצרים')
    expect(calls).toHaveLength(0)
  })
})
