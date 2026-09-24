import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of fraud review. What can only fail here is the plumbing:
 * that a queue decision updates the pending row only, that "blocked" plants
 * the manual flag beginCheckout refuses on, that a chargeback flag is created
 * from the order's customer and not from the form, that clearing is idempotent
 * on an already-cleared flag, and that every decision lands in the audit log
 * with the actor from the section gate.
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
const ITEM = '22222222-2222-4222-8222-222222222222'
const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const ORDER = '44444444-4444-4444-8444-444444444444'
const FLAG = '55555555-5555-4555-8555-555555555555'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const { resolveFraudReview, flagOrderChargeback, clearFraudFlag } = await import('./fraud')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('resolveFraudReview', () => {
  it('propagates the section gate and writes nothing', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(
      resolveFraudReview(null, form({ item_id: ITEM, decision: 'approved' })),
    ).rejects.toThrow('forbidden')
    expect(requireSection).toHaveBeenCalledWith('payments', 'write')
    expect(calls).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects a malformed id and an unknown decision before any write', async () => {
    expect(await resolveFraudReview(null, form({ item_id: 'x', decision: 'approved' }))).toEqual({
      ok: false,
      error: 'קלט לא תקין.',
    })
    expect(await resolveFraudReview(null, form({ item_id: ITEM, decision: 'maybe' }))).toEqual({
      ok: false,
      error: 'קלט לא תקין.',
    })
    expect(calls).toHaveLength(0)
  })

  it('approves: closes only the pending row, plants no flag, audits the transition', async () => {
    queue('admin:fraud_review_queue.update', {
      data: { id: ITEM, user_id: CUSTOMER, order_id: ORDER, kind: 'velocity' },
      error: null,
    })
    const result = await resolveFraudReview(
      null,
      form({ item_id: ITEM, decision: 'approved', notes: '  בסדר  ' }),
    )
    expect(result).toEqual({ ok: true })

    const update = calls.find((c) => c.table === 'admin:fraud_review_queue' && c.op === 'update')
    expect(update?.payload).toMatchObject({ status: 'approved', notes: 'בסדר', reviewed_by: ADMIN })
    expect((update?.payload as { reviewed_at: string }).reviewed_at).toMatch(/^\d{4}-/)
    expect(update?.chain).toContainEqual(['eq', ['id', ITEM]])
    expect(update?.chain).toContainEqual(['eq', ['status', 'pending']])

    expect(calls.some((c) => c.table === 'admin:fraud_flags')).toBe(false)
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'status_change',
      entityType: 'fraud_review',
      entityId: ITEM,
      changes: { status: { from: 'pending', to: 'approved' }, kind: 'velocity' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/fraud')
  })

  it('blocks: plants a manual flag with the notes or a default reason', async () => {
    queue('admin:fraud_review_queue.update', {
      data: { id: ITEM, user_id: CUSTOMER, order_id: ORDER, kind: 'velocity' },
      error: null,
    })
    expect(await resolveFraudReview(null, form({ item_id: ITEM, decision: 'blocked' }))).toEqual({
      ok: true,
    })
    const flag = calls.find((c) => c.table === 'admin:fraud_flags' && c.op === 'insert')
    expect(flag?.payload).toEqual({
      user_id: CUSTOMER,
      order_id: ORDER,
      kind: 'manual',
      reason: 'fraud review velocity',
      created_by: ADMIN,
    })

    calls.length = 0
    expect(
      await resolveFraudReview(null, form({ item_id: ITEM, decision: 'blocked', notes: 'גנוב' })),
    ).toEqual({ ok: true })
    const second = calls.find((c) => c.table === 'admin:fraud_flags' && c.op === 'insert')
    expect(second?.payload).toMatchObject({ reason: 'גנוב' })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      changes: { status: { from: 'pending', to: 'blocked' } },
    })
  })

  it('reports a failed flag insert after the item closed, without an audit row', async () => {
    queue('admin:fraud_review_queue.update', {
      data: { id: ITEM, user_id: CUSTOMER, order_id: null, kind: 'velocity' },
      error: null,
    })
    queue('admin:fraud_flags.insert', { data: null, error: { message: 'down' } })
    expect(await resolveFraudReview(null, form({ item_id: ITEM, decision: 'blocked' }))).toEqual({
      ok: false,
      error: 'הפריט נסגר אבל יצירת החסימה נכשלה. נסו לחסום שוב.',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('treats an already-resolved item as done and reports an update failure', async () => {
    expect(await resolveFraudReview(null, form({ item_id: ITEM, decision: 'approved' }))).toEqual({
      ok: true,
    })
    expect(writeAuditLog).not.toHaveBeenCalled()

    override('admin:fraud_review_queue.update', { data: null, error: { message: 'x' } })
    expect(await resolveFraudReview(null, form({ item_id: ITEM, decision: 'approved' }))).toEqual({
      ok: false,
      error: 'העדכון נכשל.',
    })
  })
})

describe('flagOrderChargeback', () => {
  it('validates the order id and the reason before reading anything', async () => {
    expect(await flagOrderChargeback(null, form({ order_id: 'nope', reason: 'x' }))).toEqual({
      ok: false,
      error: 'מזהה הזמנה לא תקין.',
    })
    expect(await flagOrderChargeback(null, form({ order_id: ORDER, reason: '   ' }))).toEqual({
      ok: false,
      error: 'נדרשת סיבה.',
    })
    expect(calls).toHaveLength(0)
  })

  it('flags the customer that the ORDER names, and audits the flag id', async () => {
    queue('admin:orders.select', { data: { id: ORDER, user_id: CUSTOMER }, error: null })
    queue('admin:fraud_flags.insert', { data: { id: FLAG }, error: null })
    expect(
      await flagOrderChargeback(null, form({ order_id: ORDER, reason: ' הכחשת עסקה ' })),
    ).toEqual({ ok: true })

    const read = calls.find((c) => c.table === 'admin:orders')
    expect(read?.chain).toContainEqual(['eq', ['id', ORDER]])
    const flag = calls.find((c) => c.table === 'admin:fraud_flags' && c.op === 'insert')
    expect(flag?.payload).toEqual({
      user_id: CUSTOMER,
      order_id: ORDER,
      kind: 'chargeback',
      reason: 'הכחשת עסקה',
      created_by: ADMIN,
    })
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'created',
      entityType: 'fraud_flag',
      entityId: FLAG,
      changes: { kind: 'chargeback', order_id: ORDER, reason: 'הכחשת עסקה' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/fraud')
  })

  it('reports a read failure, a missing order, and a failed insert', async () => {
    override('admin:orders.select', { data: null, error: { message: 'x' } })
    expect(await flagOrderChargeback(null, form({ order_id: ORDER, reason: 'r' }))).toEqual({
      ok: false,
      error: 'קריאת ההזמנה נכשלה.',
    })

    override('admin:orders.select', { data: { id: ORDER, user_id: null }, error: null })
    expect(await flagOrderChargeback(null, form({ order_id: ORDER, reason: 'r' }))).toEqual({
      ok: false,
      error: 'הזמנה לא נמצאה.',
    })

    override('admin:orders.select', { data: { id: ORDER, user_id: CUSTOMER }, error: null })
    override('admin:fraud_flags.insert', { data: null, error: { message: 'x' } })
    expect(await flagOrderChargeback(null, form({ order_id: ORDER, reason: 'r' }))).toEqual({
      ok: false,
      error: 'יצירת הדגל נכשלה.',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('clearFraudFlag', () => {
  it('rejects a malformed id', async () => {
    expect(await clearFraudFlag(null, form({ flag_id: 'bad' }))).toEqual({
      ok: false,
      error: 'קלט לא תקין.',
    })
    expect(calls).toHaveLength(0)
  })

  it('clears only a live flag and audits the transition', async () => {
    queue('admin:fraud_flags.update', {
      data: { id: FLAG, kind: 'chargeback', user_id: CUSTOMER },
      error: null,
    })
    expect(await clearFraudFlag(null, form({ flag_id: FLAG }))).toEqual({ ok: true })
    const update = calls.find((c) => c.table === 'admin:fraud_flags' && c.op === 'update')
    expect(update?.payload).toMatchObject({ cleared_by: ADMIN })
    expect(update?.chain).toContainEqual(['eq', ['id', FLAG]])
    expect(update?.chain).toContainEqual(['is', ['cleared_at', null]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityType: 'fraud_flag',
      entityId: FLAG,
      changes: { cleared: { from: false, to: true }, kind: 'chargeback' },
    })
  })

  it('is idempotent on an already-cleared flag and reports an update failure', async () => {
    expect(await clearFraudFlag(null, form({ flag_id: FLAG }))).toEqual({ ok: true })
    expect(writeAuditLog).not.toHaveBeenCalled()

    override('admin:fraud_flags.update', { data: null, error: { message: 'x' } })
    expect(await clearFraudFlag(null, form({ flag_id: FLAG }))).toEqual({
      ok: false,
      error: 'העדכון נכשל.',
    })
  })
})
