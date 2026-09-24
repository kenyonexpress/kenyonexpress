import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of public.suppliers. parseSupplierForm is proven in
 * lib/admin/supplier-form; what can only fail here is the plumbing: that the
 * section gate returns the Hebrew error and writes nothing, that every write
 * goes through the service role (authenticated has no write policy), that a
 * supplier with live products refuses to be deleted with the count in the
 * message, and that member grants upsert on the (supplier, user) pair.
 */

type Result = { data: unknown; error: unknown; count?: number | null }
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
      select: (...args: unknown[]) => builder(name, table, 'select', args),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
      upsert: (payload: unknown, options?: unknown) =>
        builder(name, table, 'upsert', { payload, options }),
    }),
  }
}

const adminClient = fakeClient('admin')

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (s: string, a: string) => requireSection(s, a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const SUPPLIER = '22222222-2222-4222-8222-222222222222'
const MEMBER = '33333333-3333-4333-8333-333333333333'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const validForm = {
  name: '  קפה ברחוב  ',
  contact_phone: '050-123-4567',
  website: 'https://coffee.example',
  status: 'active',
}

const {
  upsertSupplier,
  setSupplierStatus,
  softDeleteSupplier,
  addSupplierMember,
  deactivateSupplierMember,
} = await import('./suppliers')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('upsertSupplier', () => {
  it('returns the Hebrew error when the section gate throws, and writes nothing', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    expect(await upsertSupplier(null, form(validForm))).toEqual({ error: 'אין הרשאה' })
    expect(requireSection).toHaveBeenCalledWith('suppliers', 'write')
    expect(calls).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('returns the parser message for a bad phone without writing', async () => {
    expect(await upsertSupplier(null, form({ ...validForm, contact_phone: 'call me' }))).toEqual({
      error: 'מספר טלפון לא תקין',
    })
    expect(calls).toHaveLength(0)
  })

  it('creates through the service role with trimmed fields and audits the whole row', async () => {
    queue('admin:suppliers.insert', { data: { id: SUPPLIER }, error: null })
    expect(await upsertSupplier(null, form(validForm))).toEqual({ success: 'הספק נוצר' })

    const insert = calls.find((c) => c.table === 'admin:suppliers' && c.op === 'insert')
    expect(insert?.payload).toEqual({
      name: 'קפה ברחוב',
      contact_name: null,
      contact_email: null,
      contact_phone: '050-123-4567',
      whatsapp: null,
      address: null,
      city: null,
      website: 'https://coffee.example',
      business_id: null,
      logo_url: null,
      notes: null,
      status: 'active',
    })
    // The retired commission knobs are never sent.
    expect(insert?.payload).not.toHaveProperty('commission_percent')
    expect(insert?.chain).toContainEqual(['select', ['id']])

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'created',
      entityType: 'suppliers',
      entityId: SUPPLIER,
      changes: { name: 'קפה ברחוב', website: 'https://coffee.example' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/suppliers')
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  it('updates an existing supplier and revalidates its page', async () => {
    expect(await upsertSupplier(null, form({ ...validForm, id: SUPPLIER }))).toEqual({
      success: 'הספק עודכן',
    })
    const update = calls.find((c) => c.table === 'admin:suppliers' && c.op === 'update')
    expect(update?.payload).toMatchObject({ name: 'קפה ברחוב' })
    expect(update?.payload).not.toHaveProperty('id')
    expect(update?.chain).toContainEqual(['eq', ['id', SUPPLIER]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'updated',
      entityId: SUPPLIER,
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/suppliers/${SUPPLIER}`)
  })

  it('surfaces insert and update failures without an audit row', async () => {
    queue('admin:suppliers.insert', { data: null, error: { message: 'dup' } })
    expect(await upsertSupplier(null, form(validForm))).toEqual({ error: 'dup' })
    override('admin:suppliers.update', { data: null, error: { message: 'x' } })
    expect(await upsertSupplier(null, form({ ...validForm, id: SUPPLIER }))).toEqual({
      error: 'x',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('setSupplierStatus', () => {
  it('writes the status and audits it', async () => {
    expect(await setSupplierStatus(SUPPLIER, 'inactive')).toEqual({})
    const update = calls.find((c) => c.table === 'admin:suppliers' && c.op === 'update')
    expect(update?.payload).toEqual({ status: 'inactive' })
    expect(update?.chain).toContainEqual(['eq', ['id', SUPPLIER]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityType: 'suppliers',
      entityId: SUPPLIER,
      changes: { status: 'inactive' },
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/suppliers/${SUPPLIER}`)
  })

  it('surfaces the write error and the gate', async () => {
    override('admin:suppliers.update', { data: null, error: { message: 'x' } })
    expect(await setSupplierStatus(SUPPLIER, 'active')).toEqual({ error: 'x' })
    requireSection.mockRejectedValue(new Error('no'))
    expect(await setSupplierStatus(SUPPLIER, 'active')).toEqual({ error: 'אין הרשאה' })
  })
})

describe('softDeleteSupplier', () => {
  it('refuses while live products still point at the supplier, naming the count', async () => {
    queue('admin:products.select', { data: null, error: null, count: 3 })
    expect(await softDeleteSupplier(SUPPLIER)).toEqual({
      error: 'לא ניתן למחוק ספק עם 3 מוצרים משויכים. יש להעביר אותם קודם.',
    })
    const count = calls.find((c) => c.table === 'admin:products')
    expect(count?.payload).toEqual(['id', { count: 'exact', head: true }])
    expect(count?.chain).toContainEqual(['eq', ['supplier_id', SUPPLIER]])
    expect(count?.chain).toContainEqual(['is', ['deleted_at', null]])
    expect(calls.some((c) => c.table === 'admin:suppliers')).toBe(false)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('soft deletes an unreferenced supplier as inactive and audits', async () => {
    queue('admin:products.select', { data: null, error: null, count: 0 })
    expect(await softDeleteSupplier(SUPPLIER)).toEqual({})
    const update = calls.find((c) => c.table === 'admin:suppliers' && c.op === 'update')
    expect(update?.payload).toMatchObject({ status: 'inactive' })
    expect((update?.payload as { deleted_at: string }).deleted_at).toMatch(/^\d{4}-/)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityType: 'suppliers',
      entityId: SUPPLIER,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/suppliers')
  })

  it('surfaces the count error, the update error, and the gate', async () => {
    override('admin:products.select', { data: null, error: { message: 'count failed' } })
    expect(await softDeleteSupplier(SUPPLIER)).toEqual({ error: 'count failed' })

    override('admin:products.select', { data: null, error: null, count: null })
    override('admin:suppliers.update', { data: null, error: { message: 'x' } })
    expect(await softDeleteSupplier(SUPPLIER)).toEqual({ error: 'x' })

    requireSection.mockRejectedValue(new Error('no'))
    expect(await softDeleteSupplier(SUPPLIER)).toEqual({ error: 'אין הרשאה' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('addSupplierMember', () => {
  it('upserts on the (supplier, user) pair with the inviter and audits the grant', async () => {
    expect(await addSupplierMember(SUPPLIER, MEMBER, 'scanner')).toEqual({})
    const upsert = calls.find((c) => c.table === 'admin:supplier_members' && c.op === 'upsert')
    expect(upsert?.payload).toEqual({
      payload: {
        supplier_id: SUPPLIER,
        user_id: MEMBER,
        member_role: 'scanner',
        is_active: true,
        invited_by: ADMIN,
      },
      options: { onConflict: 'supplier_id,user_id' },
    })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'permission_change',
      entityType: 'supplier_members',
      entityId: SUPPLIER,
      changes: { user_id: MEMBER, member_role: 'scanner', is_active: true },
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/suppliers/${SUPPLIER}`)
  })

  it('surfaces the write error and the gate', async () => {
    override('admin:supplier_members.upsert', { data: null, error: { message: 'x' } })
    expect(await addSupplierMember(SUPPLIER, MEMBER, 'owner')).toEqual({ error: 'x' })
    requireSection.mockRejectedValue(new Error('no'))
    expect(await addSupplierMember(SUPPLIER, MEMBER, 'owner')).toEqual({ error: 'אין הרשאה' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('deactivateSupplierMember', () => {
  it('flips is_active off for that pair only, keeping the row', async () => {
    expect(await deactivateSupplierMember(SUPPLIER, MEMBER)).toEqual({})
    const update = calls.find((c) => c.table === 'admin:supplier_members' && c.op === 'update')
    expect(update?.payload).toEqual({ is_active: false })
    expect(update?.chain).toContainEqual(['eq', ['supplier_id', SUPPLIER]])
    expect(update?.chain).toContainEqual(['eq', ['user_id', MEMBER]])
    expect(calls.some((c) => c.op === 'delete')).toBe(false)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'permission_change',
      entityId: SUPPLIER,
      changes: { user_id: MEMBER, is_active: false },
    })
  })

  it('surfaces the write error and the gate', async () => {
    override('admin:supplier_members.update', { data: null, error: { message: 'x' } })
    expect(await deactivateSupplierMember(SUPPLIER, MEMBER)).toEqual({ error: 'x' })
    requireSection.mockRejectedValue(new Error('no'))
    expect(await deactivateSupplierMember(SUPPLIER, MEMBER)).toEqual({ error: 'אין הרשאה' })
  })
})
