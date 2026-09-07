import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of the admin status override. The policy itself is proven
 * in order-transitions.test.ts; what can only fail here is the plumbing:
 * which filters the CAS update carries, whether a raced row is overwritten or
 * refused, whether the audit row and the stock release actually happen, and
 * that a money state cannot arrive even as raw form input.
 *
 * Driven through a fake postgrest-shaped client, same as refund.test.ts,
 * because every failure worth catching is a shape failure.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const rpcCalls: { fn: string; args: unknown }[] = []
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
  }),
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve(settle(`rpc.${fn}`))
  },
}

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: (entry: unknown) => writeAuditLog(entry),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { overrideOrderStatus } from './orders'

const ORDER_ID = '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f'

function form(to: string, reason = 'הלקוח אישר קבלה בטלפון'): FormData {
  const fd = new FormData()
  fd.set('id', ORDER_ID)
  fd.set('to', to)
  fd.set('reason', reason)
  return fd
}

function orderRow(status: string, notes: string | null = null): Result {
  return { data: { id: ORDER_ID, status, notes }, error: null }
}

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  vi.clearAllMocks()
  requireAdminSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
})

describe('overrideOrderStatus', () => {
  it('refuses a money state even as raw form input', async () => {
    for (const to of ['paid', 'refunded']) {
      const result = await overrideOrderStatus(null, form(to))
      expect(result).toEqual({ error: 'סטטוס יעד לא תקין' })
    }
    // Rejected before any read: the schema never admits the value.
    expect(calls).toEqual([])
  })

  it('refuses a machine-illegal move with both ends named', async () => {
    queue('orders.select', orderRow('fulfilled'))
    const result = await overrideOrderStatus(null, form('cancelled'))
    expect(result).toEqual({ error: 'אין מעבר ידני מ"סופקה" ל"בוטלה"' })
    expect(calls.filter((c) => c.op === 'update')).toEqual([])
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('moves paid -> fulfilled with a CAS on the source status, a note and an audit row', async () => {
    queue('orders.select', orderRow('paid', 'קיים'))
    queue('orders.update', { data: { id: ORDER_ID }, error: null })

    const result = await overrideOrderStatus(null, form('fulfilled'))
    expect(result).toEqual({ success: 'הסטטוס עודכן ל"סופקה"' })

    const update = calls.find((c) => c.op === 'update')
    expect(update).toBeDefined()
    const payload = update?.payload as { status: string; notes: string }
    expect(payload.status).toBe('fulfilled')
    // The note appends, carries the actor and both ends of the move.
    expect(payload.notes.startsWith('קיים\n')).toBe(true)
    expect(payload.notes).toContain('admin-1')
    expect(payload.notes).toContain('הלקוח אישר קבלה בטלפון')
    // CAS: the write only lands if the status is still what was read.
    expect(update?.chain).toContainEqual(['eq', ['id', ORDER_ID]])
    expect(update?.chain).toContainEqual(['eq', ['status', 'paid']])

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manual_override',
        entityType: 'orders',
        entityId: ORDER_ID,
        changes: { status: { from: 'paid', to: 'fulfilled' } },
        metadata: { reason: 'הלקוח אישר קבלה בטלפון' },
      }),
    )
    // A fulfilment move never touches stock.
    expect(rpcCalls).toEqual([])
  })

  it('refuses a raced row instead of overwriting the newer state', async () => {
    queue('orders.select', orderRow('paid'))
    // CAS matched zero rows: another writer moved the order in between.
    queue('orders.update', { data: null, error: null })

    const result = await overrideOrderStatus(null, form('fulfilled'))
    expect(result).toEqual({ error: 'הסטטוס השתנה בינתיים על ידי תהליך אחר. רענן ונסה שוב.' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('releases the stock reservation on pending -> cancelled', async () => {
    queue('orders.select', orderRow('pending'))
    queue('orders.update', { data: { id: ORDER_ID }, error: null })

    const result = await overrideOrderStatus(null, form('cancelled'))
    expect(result).toEqual({ success: 'הסטטוס עודכן ל"בוטלה"' })
    expect(rpcCalls).toEqual([{ fn: 'release_order_stock', args: { p_order_id: ORDER_ID } }])
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { status: { from: 'pending', to: 'cancelled' } } }),
    )
  })

  it('requires a reason of at least 3 characters', async () => {
    const result = await overrideOrderStatus(null, form('fulfilled', 'לא'))
    expect(result).toEqual({ error: 'חובה לציין סיבה לשינוי הסטטוס (לפחות 3 תווים)' })
    expect(calls).toEqual([])
  })
})
