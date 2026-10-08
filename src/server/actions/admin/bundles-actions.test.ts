import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of product bundles (STEP 60). The set arithmetic lives in
 * lib/bundles/evaluate and is proven there; what can only fail here is the
 * edge: shekels typed by a human become integer agorot exactly once, the
 * member rows arrive as one JSON field and are replaced wholesale, a bundle
 * of one unit is refused as a price cut in disguise, an absent table names
 * the migration, and every write carries an audit row with the actor the
 * service role hides.
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

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    update: (payload: unknown) => builder(table, 'update', payload),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    delete: () => builder(table, 'delete'),
  }),
}

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (s: string, a: string) => requireSection(s, a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  updateTag: (t: string) => updateTag(t),
}))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const BUNDLE = '22222222-2222-4222-8222-222222222222'
const MUG = '33333333-3333-4333-8333-333333333333'
const PLATE = '44444444-4444-4444-8444-444444444444'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const validForm = {
  name_he: 'ספל וצלחת',
  description_he: '',
  discount_ils: '29.90',
  starts_at: '',
  expires_at: '',
  is_active: 'on',
  items_json: JSON.stringify([
    { product_id: MUG, quantity: 1 },
    { product_id: PLATE, quantity: 2 },
  ]),
}

const { saveBundle, setBundleActive, deleteBundle } = await import('./bundles')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  updateTag.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('saveBundle', () => {
  it('propagates the section gate before parsing anything', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(saveBundle({ ok: false }, form(validForm))).rejects.toThrow('forbidden')
    expect(requireSection).toHaveBeenCalledWith('discounts', 'write')
    expect(calls).toHaveLength(0)
  })

  it('refuses a set of one unit, a repeated product, and no products, without writing', async () => {
    const single = await saveBundle(
      { ok: false },
      form({ ...validForm, items_json: JSON.stringify([{ product_id: MUG, quantity: 1 }]) }),
    )
    expect(single.ok).toBe(false)
    expect(single.fieldErrors?.items?.[0]).toContain('שתי יחידות')

    const repeated = await saveBundle(
      { ok: false },
      form({
        ...validForm,
        items_json: JSON.stringify([
          { product_id: MUG, quantity: 1 },
          { product_id: MUG, quantity: 1 },
        ]),
      }),
    )
    expect(repeated.ok).toBe(false)
    expect(repeated.fieldErrors?.items?.[0]).toContain('פעם אחת')

    const none = await saveBundle({ ok: false }, form({ ...validForm, items_json: '[]' }))
    expect(none.ok).toBe(false)
    expect(none.fieldErrors?.items).toBeTruthy()

    const garbage = await saveBundle({ ok: false }, form({ ...validForm, items_json: 'not json' }))
    expect(garbage.ok).toBe(false)

    expect(calls).toHaveLength(0)
  })

  it('accepts two of one product as a set', async () => {
    queue('product_bundles.insert', { data: { id: BUNDLE }, error: null })
    const result = await saveBundle(
      { ok: false },
      form({ ...validForm, items_json: JSON.stringify([{ product_id: MUG, quantity: 2 }]) }),
    )
    expect(result).toEqual({ ok: true, id: BUNDLE })
  })

  it('refuses a zero or negative saving and a backwards window', async () => {
    const zero = await saveBundle({ ok: false }, form({ ...validForm, discount_ils: '0' }))
    expect(zero.fieldErrors?.discount_ils).toBeTruthy()
    const window = await saveBundle(
      { ok: false },
      form({ ...validForm, starts_at: '2026-12-01T00:00', expires_at: '2026-11-01T00:00' }),
    )
    expect(window.fieldErrors?.expires_at?.[0]).toContain('אחרי ההתחלה')
    expect(calls).toHaveLength(0)
  })

  it('creates: shekels become agorot once, the members are written, the audit names the actor', async () => {
    queue('product_bundles.insert', { data: { id: BUNDLE }, error: null })
    const result = await saveBundle({ ok: false }, form(validForm))
    expect(result).toEqual({ ok: true, id: BUNDLE })

    const insert = calls.find((c) => c.table === 'product_bundles' && c.op === 'insert')
    expect(insert?.payload).toMatchObject({
      name_he: 'ספל וצלחת',
      description_he: null,
      discount_agorot: 2990,
      is_active: true,
      starts_at: null,
      expires_at: null,
      created_by: ADMIN,
    })

    const cleared = calls.find((c) => c.table === 'product_bundle_items' && c.op === 'delete')
    expect(cleared?.chain).toEqual([['eq', ['bundle_id', BUNDLE]]])
    const items = calls.find((c) => c.table === 'product_bundle_items' && c.op === 'insert')
    expect(items?.payload).toEqual([
      { bundle_id: BUNDLE, product_id: MUG, quantity: 1 },
      { bundle_id: BUNDLE, product_id: PLATE, quantity: 2 },
    ])

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN,
        actorRole: 'admin',
        action: 'created',
        entityType: 'product_bundles',
        entityId: BUNDLE,
        changes: expect.objectContaining({ discount_agorot: 2990 }),
      }),
    )
    expect(updateTag).toHaveBeenCalledWith('catalogue')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/bundles')
    expect(revalidatePath).toHaveBeenCalledWith('/cart')
  })

  it('updates in place and replaces the members wholesale', async () => {
    queue('product_bundles.update', { data: { id: BUNDLE }, error: null })
    const result = await saveBundle({ ok: false }, form({ ...validForm, id: BUNDLE }))
    expect(result.ok).toBe(true)
    const update = calls.find((c) => c.table === 'product_bundles' && c.op === 'update')
    expect(update?.chain[0]).toEqual(['eq', ['id', BUNDLE]])
    expect(update?.payload).not.toHaveProperty('created_by')
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      'product_bundles.update',
      'product_bundle_items.delete',
      'product_bundle_items.insert',
    ])
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'updated' }))
  })

  it('names migration 265 when the table is absent', async () => {
    queue('product_bundles.insert', { data: null, error: { code: '42P01', message: 'missing' } })
    const result = await saveBundle({ ok: false }, form(validForm))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('265')
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('reports a product that is not a product on the items field', async () => {
    queue('product_bundles.insert', { data: { id: BUNDLE }, error: null })
    queue('product_bundle_items.insert', {
      data: null,
      error: { code: '23503', message: 'fk' },
    })
    const result = await saveBundle({ ok: false }, form(validForm))
    expect(result.ok).toBe(false)
    expect(result.fieldErrors?.items?.[0]).toContain('אינו קיים')
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('setBundleActive / deleteBundle', () => {
  it('flips the flag with a status_change audit row', async () => {
    const result = await setBundleActive(BUNDLE, false)
    expect(result.ok).toBe(true)
    const update = calls.find((c) => c.table === 'product_bundles' && c.op === 'update')
    expect(update?.payload).toEqual({ is_active: false })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'status_change', entityId: BUNDLE }),
    )
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('deletes with a deleted audit row and refuses a non-uuid without touching the database', async () => {
    expect((await deleteBundle('nope')).ok).toBe(false)
    expect(calls).toHaveLength(0)
    const result = await deleteBundle(BUNDLE)
    expect(result.ok).toBe(true)
    const del = calls.find((c) => c.table === 'product_bundles' && c.op === 'delete')
    expect(del?.chain).toEqual([['eq', ['id', BUNDLE]]])
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', entityId: BUNDLE }),
    )
  })

  it('requires write access on the discounts section', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(setBundleActive(BUNDLE, true)).rejects.toThrow('forbidden')
    await expect(deleteBundle(BUNDLE)).rejects.toThrow('forbidden')
    expect(requireSection).toHaveBeenCalledWith('discounts', 'write')
  })
})
