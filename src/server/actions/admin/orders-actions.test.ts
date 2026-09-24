import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two admin order actions orders-override.test.ts does not touch (the
 * one-click pending cancel and the note append), plus the override branches
 * it leaves: the permission refusal and the best-effort release rpc failures.
 * What can only fail here is the plumbing: that a paid order is sent to the
 * refund console rather than cancelled, that the cancel is a CAS on pending,
 * that both holds (stock and discount) are handed back and their failures are
 * logged rather than fatal, that a note APPENDS with actor and time, and that
 * every mutation writes its audit row.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const rpcCalls: { fn: string; args: unknown }[] = []
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
  }),
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve(settle(`rpc.${fn}`))
  },
}

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const { cancelPendingOrder, addOrderNote, overrideOrderStatus } = await import('./orders')

const ORDER_ID = '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f'
const ADMIN = '11111111-1111-4111-8111-111111111111'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  vi.clearAllMocks()
  requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('cancelPendingOrder', () => {
  const valid = { id: ORDER_ID, reason: 'הלקוח ביקש לבטל' }

  it('refuses a caller without an admin session before any read', async () => {
    requireAdminSession.mockRejectedValue(new Error('forbidden'))
    expect(await cancelPendingOrder(null, form(valid))).toEqual({ error: 'אין הרשאה' })
    expect(calls).toEqual([])
  })

  it('requires a valid id and a reason of at least 3 characters', async () => {
    expect(await cancelPendingOrder(null, form({ id: 'x', reason: 'סיבה' }))).toEqual({
      error: 'מזהה הזמנה לא תקין',
    })
    expect(await cancelPendingOrder(null, form({ id: ORDER_ID, reason: 'לא' }))).toEqual({
      error: 'חובה לציין סיבת ביטול (לפחות 3 תווים)',
    })
    expect(calls).toEqual([])
  })

  it('sends a paid order to the refund console and refuses any other non-pending state', async () => {
    expect(await cancelPendingOrder(null, form(valid))).toEqual({ error: 'הזמנה לא נמצאה' })
    override('orders.select', { data: { id: ORDER_ID, status: 'paid', notes: null }, error: null })
    expect(await cancelPendingOrder(null, form(valid))).toEqual({
      error: 'הזמנה ששולמה אינה מבוטלת ידנית; החזר כספי מתבצע דרך מסלול ההחזרים',
    })
    override('orders.select', {
      data: { id: ORDER_ID, status: 'fulfilled', notes: null },
      error: null,
    })
    expect(await cancelPendingOrder(null, form(valid))).toEqual({
      error: 'רק הזמנה בסטטוס ממתין ניתנת לביטול ידני',
    })
    expect(find('orders', 'update')).toBeUndefined()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('cancels with a CAS on pending, appends the reason, releases both holds and audits', async () => {
    override('orders.select', {
      data: { id: ORDER_ID, status: 'pending', notes: 'הערה קיימת' },
      error: null,
    })
    expect(await cancelPendingOrder(null, form(valid))).toEqual({ success: 'ההזמנה בוטלה' })

    const update = find('orders', 'update')
    expect(update?.payload).toEqual({
      status: 'cancelled',
      notes: 'הערה קיימת\nביטול אדמין: הלקוח ביקש לבטל',
    })
    expect(update?.chain).toContainEqual(['eq', ['id', ORDER_ID]])
    expect(update?.chain).toContainEqual(['eq', ['status', 'pending']])

    expect(rpcCalls).toEqual([
      { fn: 'release_order_stock', args: { p_order_id: ORDER_ID } },
      { fn: 'release_order_discount', args: { p_order_id: ORDER_ID } },
    ])
    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'status_change',
      entityType: 'orders',
      entityId: ORDER_ID,
      changes: { status: { from: 'pending', to: 'cancelled' } },
      metadata: { reason: 'הלקוח ביקש לבטל' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_ID}`)
  })

  it('starts the note fresh when there was none, and reports a failed update', async () => {
    override('orders.select', {
      data: { id: ORDER_ID, status: 'pending', notes: null },
      error: null,
    })
    await cancelPendingOrder(null, form(valid))
    expect(find('orders', 'update')?.payload).toMatchObject({
      notes: 'ביטול אדמין: הלקוח ביקש לבטל',
    })

    writeAuditLog.mockClear()
    override('orders.update', { data: null, error: { message: 'deadlock' } })
    expect(await cancelPendingOrder(null, form(valid))).toEqual({ error: 'deadlock' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('logs a failed hold release without failing the cancellation', async () => {
    override('orders.select', {
      data: { id: ORDER_ID, status: 'pending', notes: null },
      error: null,
    })
    override('rpc.release_order_stock', { data: null, error: { message: 'stock rpc down' } })
    override('rpc.release_order_discount', { data: null, error: { message: 'discount rpc down' } })
    expect(await cancelPendingOrder(null, form(valid))).toEqual({ success: 'ההזמנה בוטלה' })
    expect(logWarn).toHaveBeenCalledWith('admin.order_cancel_stock_release_failed', {
      orderId: ORDER_ID,
      reason: 'stock rpc down',
    })
    expect(logWarn).toHaveBeenCalledWith('admin.order_cancel_discount_release_failed', {
      orderId: ORDER_ID,
      reason: 'discount rpc down',
    })
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
  })
})

describe('addOrderNote', () => {
  it('refuses a caller without an admin session and an empty note before any read', async () => {
    requireAdminSession.mockRejectedValue(new Error('forbidden'))
    expect(await addOrderNote(null, form({ id: ORDER_ID, note: 'x' }))).toEqual({
      error: 'אין הרשאה',
    })
    requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
    expect(await addOrderNote(null, form({ id: ORDER_ID, note: '   ' }))).toEqual({
      error: 'ההערה ריקה',
    })
    expect(calls).toEqual([])
  })

  it('appends a stamped, attributed line rather than replacing, and audits the text', async () => {
    override('orders.select', { data: { notes: 'שורה ראשונה' }, error: null })
    expect(await addOrderNote(null, form({ id: ORDER_ID, note: ' התקשרתי ללקוח ' }))).toEqual({
      success: 'ההערה נוספה',
    })
    const update = find('orders', 'update')
    const notes = (update?.payload as { notes: string }).notes
    expect(notes).toMatch(
      new RegExp(`^שורה ראשונה\\n\\[\\d{4}-\\d{2}-\\d{2}T[^\\]]+\\] ${ADMIN}: התקשרתי ללקוח$`),
    )
    expect(update?.chain).toContainEqual(['eq', ['id', ORDER_ID]])
    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'updated',
      entityType: 'orders',
      entityId: ORDER_ID,
      changes: { note: 'התקשרתי ללקוח' },
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER_ID}`)
  })

  it('starts the column when it was empty', async () => {
    override('orders.select', { data: { notes: null }, error: null })
    await addOrderNote(null, form({ id: ORDER_ID, note: 'הערה' }))
    expect((find('orders', 'update')?.payload as { notes: string }).notes).toMatch(
      new RegExp(`^\\[[^\\]]+\\] ${ADMIN}: הערה$`),
    )
  })

  it('reports a failed read and a failed write with the database message', async () => {
    override('orders.select', { data: null, error: { message: 'no such order' } })
    expect(await addOrderNote(null, form({ id: ORDER_ID, note: 'הערה' }))).toEqual({
      error: 'no such order',
    })
    override('orders.select', { data: { notes: null }, error: null })
    override('orders.update', { data: null, error: { message: 'write failed' } })
    expect(await addOrderNote(null, form({ id: ORDER_ID, note: 'הערה' }))).toEqual({
      error: 'write failed',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('overrideOrderStatus: the branches the override suite leaves', () => {
  const valid = { id: ORDER_ID, to: 'cancelled', reason: 'הלקוח ביקש לבטל' }

  it('refuses a caller without an admin session before any read', async () => {
    requireAdminSession.mockRejectedValue(new Error('forbidden'))
    expect(await overrideOrderStatus(null, form(valid))).toEqual({ error: 'אין הרשאה' })
    expect(calls).toEqual([])
  })

  it('logs failed hold releases on pending -> cancelled without failing the move', async () => {
    queue('orders.select', { data: { id: ORDER_ID, status: 'pending', notes: null }, error: null })
    queue('orders.update', { data: { id: ORDER_ID }, error: null })
    override('rpc.release_order_stock', { data: null, error: { message: 'stock rpc down' } })
    override('rpc.release_order_discount', { data: null, error: { message: 'discount rpc down' } })
    expect(await overrideOrderStatus(null, form(valid))).toEqual({
      success: 'הסטטוס עודכן ל"בוטלה"',
    })
    expect(logWarn).toHaveBeenCalledWith('admin.order_override_stock_release_failed', {
      orderId: ORDER_ID,
      reason: 'stock rpc down',
    })
    expect(logWarn).toHaveBeenCalledWith('admin.order_override_discount_release_failed', {
      orderId: ORDER_ID,
      reason: 'discount rpc down',
    })
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
  })

  it('reports a failed CAS write with the database message', async () => {
    queue('orders.select', { data: { id: ORDER_ID, status: 'pending', notes: null }, error: null })
    queue('orders.update', { data: null, error: { message: 'write failed' } })
    expect(await overrideOrderStatus(null, form(valid))).toEqual({ error: 'write failed' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})
