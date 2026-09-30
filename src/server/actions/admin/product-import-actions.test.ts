import type { RawImportRow } from '@/lib/admin/product-import/import-rows'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The server half of the CSV import. Row validation is proven in
 * lib/admin/product-import; what can only fail here is the database-touching
 * part: category names resolve to ids, slug and sku collisions are reported
 * per mode, the preview writes nothing, an insert lands as a draft with the
 * derived money and the resolved category, an upsert snapshots exactly the
 * columns it changes, and a mid-batch failure replays the journal backwards.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(client: string, table: string, op: string, payload?: unknown): never {
  const record: Call = { table: `${client}:${table}`, op, payload, chain: [] }
  calls.push(record)
  const key = `${client}:${table}.${op}`
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

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
      delete: () => builder(name, table, 'delete'),
    }),
  }
}

const requestClient = fakeClient('request')

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: vi.fn(),
  updateTag: (t: string) => updateTag(t),
}))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const CATEGORY = '22222222-2222-4222-8222-222222222222'
const EXISTING = '33333333-3333-4333-8333-333333333333'
const P1 = '44444444-4444-4444-8444-444444444444'
const P2 = '55555555-5555-4555-8555-555555555555'

const SELECT = 'request:products.select'
const INSERT = 'request:products.insert'
const UPDATE = 'request:products.update'

function row(line: number, record: RawImportRow['record']): RawImportRow {
  return { line, record }
}

const physical = { name_he: 'מוצר', kenyon_price: '100', platform_percent: '30' }
const existingPhysical = {
  id: EXISTING,
  slug: 'exists',
  sku: null,
  type: 'physical',
  deleted_at: null,
}

function ops(table: string, op: string): Call[] {
  return calls.filter((c) => c.table === `request:${table}` && c.op === op)
}

const {
  previewProductImport,
  importProductsBatch,
  startProductImportRun,
  finishProductImportRun,
  rollbackProductImportRun,
} = await import('./product-import')
const { listProductImportRuns } = await import('@/server/queries/product-import-history')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  updateTag.mockReset()
  requireAdminSession.mockReset()
  requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('previewProductImport', () => {
  it('refuses without an admin session, on no rows, and above the row cap', async () => {
    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await previewProductImport([row(2, physical)])).toEqual({ error: 'אין הרשאה' })
    requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
    expect(await previewProductImport([])).toEqual({ error: 'לא התקבלו שורות לבדיקה' })
    const tooMany = Array.from({ length: 5001 }, (_, i) => row(i + 2, physical))
    expect(await previewProductImport(tooMany)).toEqual({
      error: 'הקובץ מכיל יותר מ-5000 שורות',
    })
    expect(calls).toHaveLength(0)
  })

  it('surfaces a failed category, slug, or sku lookup', async () => {
    override('request:categories.select', { data: null, error: { message: 'cat' } })
    expect(
      await previewProductImport([row(2, { ...physical, slug: 'a', category: 'קטגוריה' })]),
    ).toEqual({ error: 'cat' })

    override(SELECT, { data: null, error: { message: 'slug' } })
    expect(await previewProductImport([row(2, { ...physical, slug: 'ab' })])).toEqual({
      error: 'slug',
    })

    queues.clear()
    queue(SELECT, { data: [], error: null }, { data: null, error: { message: 'sku' } })
    expect(await previewProductImport([row(2, { ...physical, slug: 'ab', sku: 'S' })])).toEqual({
      error: 'sku',
    })
  })

  it('insert mode: resolves categories, flags collisions and duplicates, writes nothing', async () => {
    override('request:categories.select', {
      data: [{ id: CATEGORY, name_he: 'אלקטרוניקה' }],
      error: null,
    })
    queue(
      SELECT,
      { data: [existingPhysical], error: null },
      { data: [{ slug: 'other', sku: 'TAKEN' }], error: null },
    )
    const result = await previewProductImport(
      [
        row(2, { ...physical, slug: 'new-one', category: 'אלקטרוניקה', sku: 'A-1' }),
        row(3, { ...physical, slug: 'exists' }),
        row(4, { ...physical, slug: 'no-cat', category: 'לא קיימת' }),
        row(5, { slug: 'broken', name_he: 'x' }),
        row(6, { ...physical, slug: 'new-one' }),
        row(7, { ...physical, slug: 'sku-clash', sku: 'TAKEN' }),
      ],
      'insert',
    )

    expect(result.summary).toEqual({ total: 6, valid: 1, invalid: 5, inserts: 1, updates: 0 })
    const byLine = new Map(result.rows?.map((r) => [r.line, r]))
    expect(byLine.get(2)).toEqual({
      line: 2,
      slug: 'new-one',
      name: 'מוצר',
      errors: [],
      action: 'new',
    })
    expect(byLine.get(3)?.errors).toEqual(['קישור (slug) כבר קיים במערכת'])
    expect(byLine.get(3)?.action).toBeUndefined()
    expect(byLine.get(4)?.errors).toEqual(['קטגוריה "לא קיימת" לא נמצאה'])
    expect(byLine.get(5)?.errors.length).toBeGreaterThan(0)
    expect(byLine.get(6)?.errors).toEqual(['קישור (slug) כפול בקובץ - הופיע כבר בשורה 2'])
    expect(byLine.get(7)?.errors).toEqual(['מק"ט כבר קיים במערכת'])

    const categories = calls.find((c) => c.table === 'request:categories')
    expect(categories?.chain).toContainEqual(['in', ['name_he', ['אלקטרוניקה', 'לא קיימת']]])
    expect(categories?.chain).toContainEqual(['is', ['deleted_at', null]])
    expect(categories?.chain).toContainEqual(['eq', ['is_active', true]])
    const [bySlug, bySku] = ops('products', 'select')
    expect(bySlug?.chain).toContainEqual([
      'in',
      ['slug', ['new-one', 'exists', 'no-cat', 'sku-clash']],
    ])
    expect(bySku?.chain).toContainEqual(['in', ['sku', ['A-1', 'TAKEN']]])

    expect(calls.some((c) => c.op !== 'select')).toBe(false)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('upsert mode: an existing slug becomes an update only when type is stated and matches', async () => {
    queue(
      SELECT,
      {
        data: [
          existingPhysical,
          { id: P1, slug: 'archived', sku: null, type: 'physical', deleted_at: '2026-01-01' },
          { id: P2, slug: 'mine', sku: 'MINE', type: 'physical', deleted_at: null },
          { id: P2, slug: 'was-physical', sku: null, type: 'physical', deleted_at: null },
        ],
        error: null,
      },
      {
        data: [
          { slug: 'mine', sku: 'MINE' },
          { slug: 'other', sku: 'THEIRS' },
        ],
        error: null,
      },
    )
    const result = await previewProductImport(
      [
        row(2, { ...physical, slug: 'exists', type: 'physical' }),
        row(3, { ...physical, slug: 'exists', type: 'physical' }),
        row(4, { ...physical, slug: 'archived', type: 'physical' }),
        row(5, { ...physical, slug: 'exists-no-type' }),
        row(6, {
          ...physical,
          slug: 'was-physical',
          type: 'coupon',
          coupon_price_ils: '35',
          coupon_expiry_days: '60',
        }),
        row(7, { ...physical, slug: 'mine', type: 'physical', sku: 'MINE' }),
        row(8, { ...physical, slug: 'fresh', sku: 'THEIRS' }),
      ],
      'upsert',
    )
    const byLine = new Map(result.rows?.map((r) => [r.line, r]))
    expect(byLine.get(2)).toMatchObject({ errors: [], action: 'update' })
    expect(byLine.get(3)?.errors).toEqual(['קישור (slug) כפול בקובץ - הופיע כבר בשורה 2'])
    expect(byLine.get(4)?.errors).toEqual([
      'המוצר הקיים עם הקישור הזה הועבר לארכיון - שחזרו אותו לפני ייבוא מעדכן',
    ])
    expect(byLine.get(5)).toMatchObject({ errors: [], action: 'new' })
    expect(byLine.get(6)?.errors).toEqual([
      'סוג המוצר בקובץ (coupon) שונה מהמוצר הקיים (physical) - שינוי סוג לא נתמך בייבוא',
    ])
    expect(byLine.get(7)).toMatchObject({ errors: [], action: 'update' })
    expect(byLine.get(8)?.errors).toEqual(['מק"ט כבר שייך למוצר אחר (other)'])
    expect(result.summary).toEqual({ total: 7, valid: 3, invalid: 4, inserts: 1, updates: 2 })
  })

  it('upsert mode: an existing row with no type column in the file is refused', async () => {
    override(SELECT, { data: [existingPhysical], error: null })
    const result = await previewProductImport([row(2, { ...physical, slug: 'exists' })], 'upsert')
    expect(result.rows?.[0]?.errors).toEqual([
      'בעדכון מוצר קיים חובה למלא את עמודת הסוג (physical/coupon)',
    ])
  })
})

describe('importProductsBatch', () => {
  it('refuses without an admin session, on no rows, and above the batch cap', async () => {
    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await importProductsBatch([row(2, physical)])).toEqual({ error: 'אין הרשאה' })
    requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
    expect(await importProductsBatch([])).toEqual({ error: 'לא התקבלו שורות לייבוא' })
    const tooMany = Array.from({ length: 101 }, (_, i) => row(i + 2, physical))
    expect(await importProductsBatch(tooMany)).toEqual({ error: 'כל קבוצה מוגבלת ל-100 שורות' })
    expect(calls).toHaveLength(0)
    override(SELECT, { data: null, error: { message: 'slug' } })
    expect(await importProductsBatch([row(2, { ...physical, slug: 'ab' })])).toEqual({
      error: 'slug',
    })
  })

  it('inserts valid rows as drafts with derived money and the resolved category', async () => {
    override('request:categories.select', {
      data: [{ id: CATEGORY, name_he: 'אלקטרוניקה' }],
      error: null,
    })
    override(SELECT, { data: [], error: null })
    queue(INSERT, { data: { id: P1 }, error: null }, { data: { id: P2 }, error: null })
    const result = await importProductsBatch([
      row(2, {
        ...physical,
        slug: 'First-One',
        category: 'אלקטרוניקה',
        sku: 'A-1',
        full_price: '150',
        tags: 'א, ב, א',
      }),
      row(3, { ...physical, slug: 'second' }),
      row(4, { slug: 'broken', name_he: 'x' }),
    ])

    expect(result.error).toBeUndefined()
    expect(result.inserted).toBe(2)
    expect(result.updated).toBe(0)
    expect(result.results?.map((r) => [r.line, r.action, r.errors.length === 0])).toEqual([
      [2, 'new', true],
      [3, 'new', true],
      [4, undefined, false],
    ])

    const [first, second] = ops('products', 'insert')
    expect(first?.payload).toMatchObject({
      slug: 'first-one',
      name_he: 'מוצר',
      type: 'physical',
      status: 'draft',
      sku: 'A-1',
      kenyon_price: 100,
      full_price: 150,
      tags: ['א', 'ב'],
      platform_percent: 30,
      supplier_split_percent: 70,
      commission_type: 'physical_percent',
      price_ils: 100,
      category_id: CATEGORY,
      images: [],
      created_by: ADMIN,
    })
    for (const key of ['id', 'whatsapp_enabled', 'recurring_amount_ils', 'billing_interval']) {
      expect(first?.payload).not.toHaveProperty(key)
    }
    expect(first?.chain).toContainEqual(['select', ['id']])
    expect(second?.payload).toMatchObject({ slug: 'second', category_id: null })

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'created',
      entityType: 'products',
      changes: { source: 'file_import', inserted: 2, slugs: ['first-one', 'second'] },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/products')
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('upserts an existing product: snapshots only the changing columns, then updates', async () => {
    override('request:categories.select', {
      data: [{ id: CATEGORY, name_he: 'אלקטרוניקה' }],
      error: null,
    })
    const prior = { name_he: 'ישן', kenyon_price: 80, platform_percent: 20 }
    queue(SELECT, { data: [existingPhysical], error: null }, { data: prior, error: null })
    const result = await importProductsBatch(
      [
        row(2, {
          ...physical,
          slug: 'exists',
          type: 'physical',
          name_he: 'חדש',
          category: 'אלקטרוניקה',
        }),
      ],
      'upsert',
    )
    expect(result).toMatchObject({ inserted: 0, updated: 1 })
    expect(result.results?.[0]).toMatchObject({ line: 2, action: 'update', errors: [] })

    const [, snapshot] = ops('products', 'select')
    expect(snapshot?.chain).toContainEqual(['eq', ['id', EXISTING]])
    const columns = String(snapshot?.payload).split(',')
    expect(columns).toEqual(expect.arrayContaining(['kenyon_price', 'name_he', 'category_id']))
    expect(columns).not.toContain('status')

    const [update] = ops('products', 'update')
    expect(update?.payload).toMatchObject({
      name_he: 'חדש',
      kenyon_price: 100,
      platform_percent: 30,
      supplier_split_percent: 70,
      price_ils: 100,
      category_id: CATEGORY,
    })
    for (const key of ['status', 'images', 'type', 'supplier_id', 'created_by', 'description_he']) {
      expect(update?.payload).not.toHaveProperty(key)
    }
    expect(update?.chain).toContainEqual(['eq', ['id', EXISTING]])
    expect(ops('products', 'insert')).toHaveLength(0)

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'updated',
      changes: { source: 'file_import', updated: 1, slugs: ['exists'] },
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('clears the category on upsert when the column is present but empty', async () => {
    const prior = { name_he: 'ישן' }
    queue(SELECT, { data: [existingPhysical], error: null }, { data: prior, error: null })
    await importProductsBatch(
      [row(2, { ...physical, slug: 'exists', type: 'physical', category: '' })],
      'upsert',
    )
    expect(ops('products', 'update')[0]?.payload).toMatchObject({ category_id: null })
  })

  it('rolls an insert failure back by deleting what the batch already inserted', async () => {
    override(SELECT, { data: [], error: null })
    queue(INSERT, { data: { id: P1 }, error: null }, { data: null, error: { message: 'boom' } })
    const result = await importProductsBatch([
      row(2, { ...physical, slug: 'one' }),
      row(3, { ...physical, slug: 'two' }),
    ])
    expect(result).toEqual({ error: 'שורה 3: boom - כל השורות בקבוצה בוטלו (rollback)' })
    const [del] = ops('products', 'delete')
    expect(del?.chain).toContainEqual(['eq', ['id', P1]])
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('restores an updated row from its snapshot and counts a failed revert', async () => {
    const prior = { name_he: 'ישן', kenyon_price: 80 }
    queue(SELECT, { data: [existingPhysical], error: null }, { data: prior, error: null })
    queue(UPDATE, { data: null, error: null }, { data: null, error: { message: 'revert failed' } })
    override(INSERT, { data: null, error: null })
    const result = await importProductsBatch(
      [
        row(2, { ...physical, slug: 'exists', type: 'physical' }),
        row(3, { ...physical, slug: 'fresh', type: 'physical' }),
      ],
      'upsert',
    )
    expect(result).toEqual({
      error: 'שורה 3: ההוספה נכשלה (שחזור של 1 שורות נכשל - יש לבדוק ידנית)',
    })
    const [, revert] = ops('products', 'update')
    expect(revert?.payload).toEqual(prior)
    expect(revert?.chain).toContainEqual(['eq', ['id', EXISTING]])
    expect(ops('products', 'delete')).toHaveLength(0)
  })

  it('stops an upsert whose snapshot or update fails', async () => {
    queue(SELECT, { data: [existingPhysical], error: null }, { data: null, error: null })
    expect(
      await importProductsBatch(
        [row(2, { ...physical, slug: 'exists', type: 'physical' })],
        'upsert',
      ),
    ).toEqual({ error: 'שורה 2: המוצר לעדכון לא נמצא - כל השורות בקבוצה בוטלו (rollback)' })

    queues.clear()
    queue(
      SELECT,
      { data: [existingPhysical], error: null },
      { data: null, error: { message: 'snapshot failed' } },
    )
    expect(
      await importProductsBatch(
        [row(2, { ...physical, slug: 'exists', type: 'physical' })],
        'upsert',
      ),
    ).toEqual({ error: 'שורה 2: snapshot failed - כל השורות בקבוצה בוטלו (rollback)' })

    queues.clear()
    queue(
      SELECT,
      { data: [existingPhysical], error: null },
      { data: { name_he: 'x' }, error: null },
    )
    override(UPDATE, { data: null, error: { message: 'update failed' } })
    expect(
      await importProductsBatch(
        [row(2, { ...physical, slug: 'exists', type: 'physical' })],
        'upsert',
      ),
    ).toEqual({ error: 'שורה 2: update failed - כל השורות בקבוצה בוטלו (rollback)' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('writes nothing and audits nothing when every row is invalid', async () => {
    const result = await importProductsBatch([row(2, { slug: 'x', name_he: 'y' })])
    expect(result).toMatchObject({ inserted: 0, updated: 0 })
    expect(result.results?.[0]?.errors.length).toBeGreaterThan(0)
    expect(calls.some((c) => c.op !== 'select')).toBe(false)
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('treats any mode other than upsert as insert', async () => {
    override(SELECT, { data: [existingPhysical], error: null })
    const result = await importProductsBatch(
      [row(2, { ...physical, slug: 'exists', type: 'physical' })],
      'anything' as never,
    )
    expect(result.results?.[0]?.errors).toEqual(['קישור (slug) כבר קיים במערכת'])
  })
})

const RUN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUDIT_SELECT = 'request:audit_log.select'

function auditCalls(entityType: string) {
  return writeAuditLog.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((e) => e.entityType === entityType)
}

describe('import runs (history log)', () => {
  it('startProductImportRun mints a run id and writes the created row, sanitised', async () => {
    const res = await startProductImportRun({
      fileName: 'x'.repeat(300),
      mode: 'upsert',
      summary: { total: 10, valid: 8, invalid: 2, inserts: 5, updates: 3 },
      columns: ['slug', 'name_he', 7 as unknown as string],
    })
    expect(res.runId).toMatch(/^[0-9a-f-]{36}$/)
    const [created] = auditCalls('product_import_run')
    expect(created).toMatchObject({
      actorId: ADMIN,
      action: 'created',
      entityId: res.runId,
      changes: {
        file_name: 'x'.repeat(200),
        mode: 'upsert',
        total: 10,
        valid: 8,
        invalid: 2,
        inserts: 5,
        updates: 3,
        columns: ['slug', 'name_he'],
      },
    })

    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(
      await startProductImportRun({
        fileName: 'a',
        mode: 'insert',
        summary: { total: 0, valid: 0, invalid: 0, inserts: 0, updates: 0 },
        columns: [],
      }),
    ).toEqual({ error: 'אין הרשאה' })
  })

  it('a batch inside a run journals itself on the run row and tags the product rows', async () => {
    override(SELECT, { data: [], error: null })
    queue(INSERT, { data: { id: P1 }, error: null })
    const res = await importProductsBatch([row(2, { ...physical, slug: 'one' })], 'insert', {
      id: RUN,
      batch: 3,
    })
    expect(res.inserted).toBe(1)

    const [products] = auditCalls('products')
    expect(products?.changes).toMatchObject({ source: 'file_import', run_id: RUN })
    const [runRow] = auditCalls('product_import_run')
    expect(runRow).toMatchObject({
      action: 'updated',
      entityId: RUN,
      changes: { batch: 3, inserted: 1, updated: 0, slugs_inserted: ['one'] },
      before: { inserts: [P1], updates: [] },
    })
  })

  it('an upsert batch journals the prior columns; a malformed run ref is ignored', async () => {
    const prior = { name_he: 'ישן', kenyon_price: 80 }
    queue(SELECT, { data: [existingPhysical], error: null }, { data: prior, error: null })
    await importProductsBatch(
      [row(2, { ...physical, slug: 'exists', type: 'physical', name_he: 'חדש' })],
      'upsert',
      { id: RUN, batch: 1 },
    )
    const [runRow] = auditCalls('product_import_run')
    expect(runRow?.before).toEqual({ inserts: [], updates: [{ id: EXISTING, prior }] })

    writeAuditLog.mockReset()
    queues.clear()
    override(SELECT, { data: [], error: null })
    queue(INSERT, { data: { id: P2 }, error: null })
    await importProductsBatch([row(2, { ...physical, slug: 'two' })], 'insert', {
      id: 'not-a-uuid',
      batch: 1,
    } as never)
    expect(auditCalls('product_import_run')).toHaveLength(0)
    expect(auditCalls('products')[0]?.changes).toMatchObject({ run_id: null })
  })

  it('finishProductImportRun writes the status row and caps the row errors', async () => {
    const rowErrors = Array.from({ length: 250 }, (_, i) => ({
      line: i + 2,
      slug: `s${i}`,
      name: null,
      errors: ['bad'],
    }))
    expect(
      await finishProductImportRun(RUN, {
        status: 'partial',
        inserted: 4,
        updated: 1,
        failed: 250,
        error: 'שורה 9: boom',
        rowErrors,
      }),
    ).toEqual({})
    const [finished] = auditCalls('product_import_run')
    expect(finished).toMatchObject({
      action: 'status_change',
      entityId: RUN,
      changes: { status: 'partial', inserted: 4, updated: 1, failed: 250, error: 'שורה 9: boom' },
    })
    expect((finished?.changes as { row_errors: unknown[] }).row_errors).toHaveLength(200)

    expect(
      await finishProductImportRun('nope', {
        status: 'done',
        inserted: 0,
        updated: 0,
        failed: 0,
        error: null,
        rowErrors: [],
      }),
    ).toEqual({ error: 'מזהה ריצה לא תקין' })
  })

  it('listProductImportRuns folds the audit rows into runs, newest first', async () => {
    override(AUDIT_SELECT, {
      data: [
        {
          id: 'e3',
          entity_id: RUN,
          action: 'status_change',
          created_at: '2026-10-01T10:00:10Z',
          actor_id: ADMIN,
          changes: { status: 'done', inserted: 1, updated: 0, failed: 0 },
          before: null,
        },
        {
          id: 'e1',
          entity_id: RUN,
          action: 'created',
          created_at: '2026-10-01T10:00:00Z',
          actor_id: ADMIN,
          changes: { file_name: 'a.csv', mode: 'insert', total: 1, valid: 1, invalid: 0 },
          before: null,
        },
      ],
      error: null,
    })
    const res = await listProductImportRuns(requestClient as never)
    expect(res.error).toBeUndefined()
    expect(res.truncated).toBe(false)
    expect(res.runs?.map((r) => [r.id, r.status, r.fileName, r.inserted])).toEqual([
      [RUN, 'done', 'a.csv', 1],
    ])
    const [select] = calls.filter((c) => c.table === 'request:audit_log')
    expect(select?.chain).toContainEqual(['eq', ['entity_type', 'product_import_run']])

    override(AUDIT_SELECT, { data: null, error: { message: 'denied' } })
    expect(await listProductImportRuns(requestClient as never)).toEqual({ error: 'denied' })
  })
})

describe('rollbackProductImportRun', () => {
  const U_EDITED = '66666666-6666-4666-8666-666666666666'
  const events = [
    {
      id: 'e1',
      entity_id: RUN,
      action: 'created',
      created_at: '2026-10-01T10:00:00.000Z',
      actor_id: ADMIN,
      changes: { file_name: 'a.csv', mode: 'upsert', total: 4, valid: 4, invalid: 0 },
      before: null,
    },
    {
      id: 'e2',
      entity_id: RUN,
      action: 'updated',
      created_at: '2026-10-01T10:00:05.000Z',
      actor_id: ADMIN,
      changes: { batch: 1, inserted: 2, updated: 2 },
      before: {
        inserts: [P1, P2],
        updates: [
          { id: EXISTING, prior: { name_he: 'ישן', kenyon_price: 80 } },
          { id: U_EDITED, prior: { name_he: 'לפני' } },
        ],
      },
    },
    {
      id: 'e3',
      entity_id: RUN,
      action: 'status_change',
      created_at: '2026-10-01T10:00:10.000Z',
      actor_id: ADMIN,
      changes: { status: 'done', inserted: 2, updated: 2, failed: 0 },
      before: null,
    },
  ]

  it('refuses without a session, on a bad id, on an unknown run, and on a run already undone', async () => {
    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await rollbackProductImportRun(RUN)).toEqual({ error: 'אין הרשאה' })
    requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
    expect(await rollbackProductImportRun('nope')).toEqual({ error: 'מזהה ריצה לא תקין' })

    override(AUDIT_SELECT, { data: [], error: null })
    expect(await rollbackProductImportRun(RUN)).toEqual({ error: 'ריצת הייבוא לא נמצאה' })

    override(AUDIT_SELECT, {
      data: [
        ...events,
        {
          id: 'e4',
          entity_id: RUN,
          action: 'restored',
          created_at: '2026-10-01T11:00:00.000Z',
          actor_id: ADMIN,
          changes: {},
          before: null,
        },
      ],
      error: null,
    })
    expect(await rollbackProductImportRun(RUN)).toEqual({ error: 'הריצה הזו כבר בוטלה' })
    expect(ops('products', 'delete')).toHaveLength(0)
    expect(ops('products', 'update')).toHaveLength(0)
  })

  it('replays the merged journal backwards, skipping products edited since the run', async () => {
    override(AUDIT_SELECT, { data: events, error: null })
    // P2 is already gone; U_EDITED was touched after the run's last event.
    override(SELECT, {
      data: [
        { id: P1, updated_at: '2026-10-01T10:00:04.000Z' },
        { id: EXISTING, updated_at: '2026-10-01T10:00:04.500Z' },
        { id: U_EDITED, updated_at: '2026-10-01T12:00:00.000Z' },
      ],
      error: null,
    })
    const res = await rollbackProductImportRun(RUN)
    expect(res).toEqual({ revertedInserts: 2, revertedUpdates: 1, skipped: 1, failures: 0 })

    const [read] = ops('products', 'select')
    expect(read?.chain).toContainEqual(['in', ['id', [P1, P2, EXISTING, U_EDITED]]])
    const [update] = ops('products', 'update')
    expect(update?.payload).toEqual({ name_he: 'ישן', kenyon_price: 80 })
    expect(update?.chain).toContainEqual(['eq', ['id', EXISTING]])
    expect(ops('products', 'update')).toHaveLength(1)
    const [del] = ops('products', 'delete')
    expect(del?.chain).toContainEqual(['eq', ['id', P1]])
    expect(ops('products', 'delete')).toHaveLength(1)

    const [restored] = auditCalls('product_import_run')
    expect(restored).toMatchObject({
      action: 'restored',
      entityId: RUN,
      changes: { reverted_inserts: 2, reverted_updates: 1, skipped: 1, failures: 0 },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/products')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/products/import/history')
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('counts a failed delete or restore instead of aborting the rest', async () => {
    override(AUDIT_SELECT, { data: events, error: null })
    override(SELECT, {
      data: [
        { id: P1, updated_at: '2026-10-01T10:00:04.000Z' },
        { id: P2, updated_at: '2026-10-01T10:00:04.000Z' },
        { id: EXISTING, updated_at: '2026-10-01T10:00:04.000Z' },
        { id: U_EDITED, updated_at: '2026-10-01T10:00:04.000Z' },
      ],
      error: null,
    })
    queue(UPDATE, { data: null, error: { message: 'locked' } }, { data: null, error: null })
    queue(
      'request:products.delete',
      { data: null, error: null },
      { data: null, error: { message: 'fk' } },
    )
    const res = await rollbackProductImportRun(RUN)
    expect(res).toEqual({ revertedInserts: 1, revertedUpdates: 1, skipped: 0, failures: 2 })
    // Updates newest-first: U_EDITED (second in the journal) is restored first.
    expect(ops('products', 'update')[0]?.chain).toContainEqual(['eq', ['id', U_EDITED]])
  })
})
