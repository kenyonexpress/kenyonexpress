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
const DELETE = 'request:products.delete'

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

const { previewProductImport, importProductsBatch } = await import('./product-import')

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
