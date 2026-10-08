import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of flash sales (STEP 61). What can only fail here is the
 * edge: shekels typed by a human become integer agorot exactly once, a
 * "was" price at or below the flash price is refused, a window that ends
 * before it starts is refused, an absent table names the migration, a
 * product id that is not a product is a field error, and every write
 * carries an audit row with the actor the service role hides.
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
const SALE = '22222222-2222-4222-8222-222222222222'
const MUG = '33333333-3333-4333-8333-333333333333'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const validForm = {
  name_he: 'ספל בבזק',
  product_id: MUG,
  price_ils: '29.90',
  reference_ils: '59.90',
  allocation: '20',
  max_per_claim: '2',
  hold_minutes: '10',
  starts_at: '2026-10-09T10:00',
  ends_at: '2026-10-09T12:00',
  is_active: 'on',
}

const { saveFlashSale, setFlashSaleActive, deleteFlashSale } = await import('./flash-sales')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  updateTag.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('saveFlashSale', () => {
  it('propagates the section gate before parsing anything', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(saveFlashSale({ ok: false }, form(validForm))).rejects.toThrow('forbidden')
    expect(requireSection).toHaveBeenCalledWith('discounts', 'write')
    expect(calls).toHaveLength(0)
  })

  it('refuses a reference at or below the flash price, and a window ending before it starts', async () => {
    const low = await saveFlashSale({ ok: false }, form({ ...validForm, reference_ils: '29.90' }))
    expect(low.ok).toBe(false)
    expect(low.fieldErrors?.reference_ils?.[0]).toContain('גבוה')

    const backwards = await saveFlashSale(
      { ok: false },
      form({ ...validForm, starts_at: '2026-10-09T12:00', ends_at: '2026-10-09T10:00' }),
    )
    expect(backwards.ok).toBe(false)
    expect(backwards.fieldErrors?.ends_at?.[0]).toContain('אחרי')

    const noProduct = await saveFlashSale({ ok: false }, form({ ...validForm, product_id: '' }))
    expect(noProduct.ok).toBe(false)
    expect(noProduct.fieldErrors?.product_id).toBeTruthy()

    const tooMany = await saveFlashSale({ ok: false }, form({ ...validForm, max_per_claim: '11' }))
    expect(tooMany.ok).toBe(false)
    expect(tooMany.fieldErrors?.max_per_claim).toBeTruthy()

    expect(calls).toHaveLength(0)
  })

  it('converts shekels to integer agorot once, ISO-dates the window, inserts with the actor and audits', async () => {
    queue('flash_sales.insert', { data: { id: SALE }, error: null })

    const result = await saveFlashSale({ ok: false }, form(validForm))

    expect(result).toEqual({ ok: true, id: SALE })
    const insert = calls.find((c) => c.table === 'flash_sales' && c.op === 'insert')
    expect(insert?.payload).toMatchObject({
      product_id: MUG,
      name_he: 'ספל בבזק',
      price_agorot: 2990,
      reference_agorot: 5990,
      allocation: 20,
      max_per_claim: 2,
      hold_minutes: 10,
      is_active: true,
      created_by: ADMIN,
    })
    const payload = insert?.payload as { starts_at: string; ends_at: string }
    expect(Date.parse(payload.starts_at)).toBeLessThan(Date.parse(payload.ends_at))
    expect(payload.starts_at).toMatch(/Z$/)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN,
        action: 'created',
        entityType: 'flash_sales',
        entityId: SALE,
      }),
    )
    expect(updateTag).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith(`/flash/${SALE}`)
  })

  it('stores an empty reference as null and defaults the per-claim and hold fields', async () => {
    queue('flash_sales.insert', { data: { id: SALE }, error: null })
    await saveFlashSale(
      { ok: false },
      form({ ...validForm, reference_ils: '', max_per_claim: '', hold_minutes: '' }),
    )
    const insert = calls.find((c) => c.table === 'flash_sales' && c.op === 'insert')
    expect(insert?.payload).toMatchObject({
      reference_agorot: null,
      max_per_claim: 1,
      hold_minutes: 10,
    })
  })

  it('updates in place when an id is given and audits as updated', async () => {
    queue('flash_sales.update', { data: { id: SALE }, error: null })
    const result = await saveFlashSale({ ok: false }, form({ ...validForm, id: SALE }))
    expect(result).toEqual({ ok: true, id: SALE })
    const update = calls.find((c) => c.table === 'flash_sales' && c.op === 'update')
    expect(update?.chain).toEqual(expect.arrayContaining([['eq', ['id', SALE]]]))
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'updated' }))
  })

  it('names the migration when the table is absent and the product when the FK fails', async () => {
    queue('flash_sales.insert', {
      data: null,
      error: { code: '42P01', message: 'relation "public.flash_sales" does not exist' },
    })
    const absent = await saveFlashSale({ ok: false }, form(validForm))
    expect(absent.ok).toBe(false)
    expect(absent.error).toContain('266')

    // The queue hands one entry out forever until a second arrives; start fresh.
    queues.clear()
    queue('flash_sales.insert', { data: null, error: { code: '23503', message: 'fk' } })
    const fk = await saveFlashSale({ ok: false }, form(validForm))
    expect(fk.ok).toBe(false)
    expect(fk.fieldErrors?.product_id?.[0]).toContain('אינו קיים')
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('setFlashSaleActive and deleteFlashSale', () => {
  it('refuse a malformed id without writing', async () => {
    expect((await setFlashSaleActive('nope', false)).ok).toBe(false)
    expect((await deleteFlashSale('nope')).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('flip the flag and delete through the service role with an audit row each', async () => {
    const off = await setFlashSaleActive(SALE, false)
    expect(off.ok).toBe(true)
    const update = calls.find((c) => c.table === 'flash_sales' && c.op === 'update')
    expect(update?.payload).toEqual({ is_active: false })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'status_change', changes: { is_active: false } }),
    )

    const gone = await deleteFlashSale(SALE)
    expect(gone.ok).toBe(true)
    expect(calls.some((c) => c.table === 'flash_sales' && c.op === 'delete')).toBe(true)
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'deleted' }))
  })
})
