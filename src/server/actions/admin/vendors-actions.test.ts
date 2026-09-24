import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of the legacy vendors table. parseVendorForm is proven in
 * lib/admin/vendor-form; what can only fail here is the plumbing: that a
 * permission failure returns the Hebrew error and writes nothing, that the
 * parsed fields (and not the id) reach the row, that bank details stay out of
 * the audit row, and that the commission action refuses rather than writing
 * a column migration 112 archived.
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
    }),
  }
}

const requestClient = fakeClient('request')

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const VENDOR = '22222222-2222-4222-8222-222222222222'
const PROFILE = '33333333-3333-4333-8333-333333333333'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const validForm = {
  profile_id: PROFILE,
  business_name: 'חנות הדגמה',
  business_id: '512345678',
  contact_email: 'shop@example.com',
  bank_account: '123456',
  bank_name: 'לאומי',
  status: 'active',
}

const { upsertVendor, updateVendorStatus, updateVendorCommission, softDeleteVendor } = await import(
  './vendors'
)

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  requireAdminSession.mockReset()
  requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('upsertVendor', () => {
  it('refuses a non-admin before touching the database', async () => {
    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await upsertVendor(null, form(validForm))).toEqual({ error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('returns the parser message for bad input and for a create without a profile', async () => {
    expect(await upsertVendor(null, form({ ...validForm, business_name: 'א' }))).toEqual({
      error: 'שם עסק נדרש',
    })
    expect(await upsertVendor(null, form({ ...validForm, profile_id: '' }))).toEqual({
      error: 'יש לבחור משתמש לקישור הספק',
    })
    expect(calls).toHaveLength(0)
  })

  it('creates a vendor with every field, keeps bank details out of the audit', async () => {
    queue('request:vendors.insert', { data: { id: VENDOR }, error: null })
    expect(await upsertVendor(null, form(validForm))).toEqual({ success: 'ספק נוצר' })

    const insert = calls.find((c) => c.table === 'request:vendors' && c.op === 'insert')
    expect(insert?.payload).toMatchObject({
      profile_id: PROFILE,
      business_name: 'חנות הדגמה',
      business_id: '512345678',
      contact_email: 'shop@example.com',
      bank_account: '123456',
      bank_name: 'לאומי',
      legal_name: null,
      status: 'active',
    })
    expect(insert?.payload).not.toHaveProperty('id')
    expect(insert?.chain).toContainEqual(['select', ['id']])

    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    const first = writeAuditLog.mock.calls[0]?.[0] as { changes: Record<string, unknown> }
    expect(first).toMatchObject({
      actorId: ADMIN,
      action: 'created',
      entityType: 'vendors',
      entityId: VENDOR,
      changes: {
        business_name: 'חנות הדגמה',
        business_id: '512345678',
        contact_email: 'shop@example.com',
        status: 'active',
      },
    })
    expect(first.changes).not.toHaveProperty('bank_account')
    expect(first.changes).not.toHaveProperty('bank_name')
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      action: 'created',
      changes: { old: null, new: { id: null, business_name: 'חנות הדגמה' } },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/vendors')
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  it('updates an existing vendor and revalidates its detail page too', async () => {
    expect(await upsertVendor(null, form({ ...validForm, id: VENDOR, profile_id: '' }))).toEqual({
      success: 'ספק עודכן',
    })
    const update = calls.find((c) => c.table === 'request:vendors' && c.op === 'update')
    expect(update?.payload).toMatchObject({ business_name: 'חנות הדגמה', status: 'active' })
    expect(update?.payload).not.toHaveProperty('id')
    expect(update?.chain).toContainEqual(['eq', ['id', VENDOR]])
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({ action: 'updated', entityId: VENDOR })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      action: 'updated',
      entityId: VENDOR,
      changes: { new: { id: VENDOR } },
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/vendors/${VENDOR}`)
  })

  it('surfaces insert and update errors without an audit row', async () => {
    queue('request:vendors.insert', { data: null, error: { message: 'dup' } })
    expect(await upsertVendor(null, form(validForm))).toEqual({ error: 'dup' })

    override('request:vendors.update', { data: null, error: { message: 'rls' } })
    expect(await upsertVendor(null, form({ ...validForm, id: VENDOR }))).toEqual({ error: 'rls' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('updateVendorStatus', () => {
  it('rejects an unknown status before any write', async () => {
    expect(await updateVendorStatus(null, form({ id: VENDOR, status: 'gone' }))).toEqual({
      error: 'סטטוס לא תקין',
    })
    expect(calls).toHaveLength(0)
  })

  it('writes the status and audits it', async () => {
    expect(await updateVendorStatus(null, form({ id: VENDOR, status: 'suspended' }))).toEqual({
      success: 'סטטוס עודכן',
    })
    const update = calls.find((c) => c.table === 'request:vendors' && c.op === 'update')
    expect(update?.payload).toEqual({ status: 'suspended' })
    expect(update?.chain).toContainEqual(['eq', ['id', VENDOR]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityType: 'vendors',
      entityId: VENDOR,
      changes: { status: 'suspended' },
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/vendors/${VENDOR}`)
  })

  it('surfaces the database error and refuses a non-admin', async () => {
    override('request:vendors.update', { data: null, error: { message: 'x' } })
    expect(await updateVendorStatus(null, form({ id: VENDOR, status: 'active' }))).toEqual({
      error: 'x',
    })
    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await updateVendorStatus(null, form({ id: VENDOR, status: 'active' }))).toEqual({
      error: 'אין הרשאה',
    })
  })
})

describe('updateVendorCommission', () => {
  it('refuses for everyone: the column was archived by migration 112', async () => {
    expect(await updateVendorCommission(null, form({ id: VENDOR }))).toEqual({
      error: 'עמלה אינה נקבעת ברמת הספק. העמלה מוגדרת פר מוצר בשדה platform_percent.',
    })
    expect(calls).toHaveLength(0)

    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await updateVendorCommission(null, form({ id: VENDOR }))).toEqual({
      error: 'אין הרשאה',
    })
  })
})

describe('softDeleteVendor', () => {
  it('stamps deleted_at, suspends, and audits', async () => {
    expect(await softDeleteVendor(VENDOR)).toEqual({})
    const update = calls.find((c) => c.table === 'request:vendors' && c.op === 'update')
    expect(update?.payload).toMatchObject({ status: 'suspended' })
    expect((update?.payload as { deleted_at: string }).deleted_at).toMatch(/^\d{4}-/)
    expect(update?.chain).toContainEqual(['eq', ['id', VENDOR]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityId: VENDOR,
      changes: { status: 'suspended' },
    })
  })

  it('surfaces the database error and refuses a non-admin', async () => {
    override('request:vendors.update', { data: null, error: { message: 'x' } })
    expect(await softDeleteVendor(VENDOR)).toEqual({ error: 'x' })
    requireAdminSession.mockRejectedValue(new Error('no'))
    expect(await softDeleteVendor(VENDOR)).toEqual({ error: 'אין הרשאה' })
  })
})
