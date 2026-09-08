import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action's job is narrow and every part of it is a guard: write the
 * whitelist, write it to THIS supplier's row only, and never resurrect a
 * deleted business. `suppliers` has no UPDATE policy a supplier owner
 * satisfies, so this write goes through the service role and the assertions
 * below are what stands in for the policy that is not there.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
let updateResult: Result = { data: null, error: null }

function builder(table: string, op: string, payload?: unknown): never {
  const record: Call = { table, op, payload, chain: [] }
  calls.push(record)
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown) => Promise.resolve(updateResult).then(resolve)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    update: (payload: unknown) => builder(table, 'update', payload),
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
  }),
}

const requireSupplierRole = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supplier/rbac', () => ({
  requireSupplierRole: (...a: unknown[]) => requireSupplierRole(...a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (...a: unknown[]) => writeAuditLog(...a) }))
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  updateTag: (...a: unknown[]) => updateTag(...a),
}))

import { updateSupplierProfile } from './profile'

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  calls.length = 0
  updateResult = { data: null, error: null }
  requireSupplierRole
    .mockReset()
    .mockResolvedValue({ userId: 'user-1', supplierId: 'sup-1', memberRole: 'owner' })
  writeAuditLog.mockReset().mockResolvedValue(undefined)
  revalidatePath.mockReset()
})

describe('updateSupplierProfile', () => {
  it('requires the owner role, not merely membership', async () => {
    await updateSupplierProfile(null, form({ contact_name: 'דנה' }))
    expect(requireSupplierRole).toHaveBeenCalledWith('owner', '/supplier/profile')
  })

  it('writes only the whitelisted columns, scoped to the caller own live row', async () => {
    const result = await updateSupplierProfile(
      null,
      form({
        contact_name: 'דנה',
        contact_phone: '050-123-4567',
        city: 'חיפה',
        // Everything below is posted and must not survive: a forged form is the
        // exact attack the whitelist exists for, because the service role would
        // happily write any of them.
        name: 'עסק אחר',
        status: 'active',
        business_id: '515151515',
        notes: 'הערה',
        id: 'other-supplier',
      }),
    )

    expect(result).toEqual({ success: 'הפרטים נשמרו' })
    const update = calls.find((c) => c.table === 'suppliers' && c.op === 'update')
    expect(update?.payload).toEqual({
      contact_name: 'דנה',
      contact_email: null,
      contact_phone: '050-123-4567',
      whatsapp: null,
      address: null,
      city: 'חיפה',
      website: null,
      logo_url: null,
    })
    expect(update?.chain).toEqual([
      ['eq', ['id', 'sup-1']],
      ['is', ['deleted_at', null]],
    ])
  })

  it('refuses a malformed phone before touching the database', async () => {
    const result = await updateSupplierProfile(null, form({ contact_phone: 'לא טלפון' }))
    expect(result).toEqual({ error: 'מספר טלפון לא תקין' })
    expect(calls).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('reports a failed write as a failure and writes no audit row', async () => {
    updateResult = { data: null, error: { message: 'permission denied' } }
    const result = await updateSupplierProfile(null, form({ city: 'חיפה' }))
    expect(result).toEqual({ error: 'השמירה נכשלה, נסו שוב' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('records who changed what, as a vendor actor', async () => {
    await updateSupplierProfile(null, form({ city: 'חיפה' }))
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        actorRole: 'vendor',
        action: 'updated',
        entityType: 'suppliers',
        entityId: 'sup-1',
      }),
    )
  })
})

describe('the storefront is told', () => {
  it('invalidates the catalogue tag, because the supplier block is cached under it', async () => {
    // Added 2026-09-08. This path wrote the business's own name, address and
    // phone and invalidated nothing, so the supplier block on its own product
    // pages kept the old details for up to an hour while this form showed the
    // new ones immediately - which reads exactly like the save having failed.
    // lib/catalogue-cache.ts states the contract; supplier writes were in
    // neither its compliant list nor its exception list.
    await updateSupplierProfile(
      null,
      form({ name: 'שם חדש', address: 'רחוב חדש 5', contact_phone: '03-1234567' }),
    )
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })
})
