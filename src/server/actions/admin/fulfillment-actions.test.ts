import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The board's three bulk moves. What the pure machines cannot test is the
 * plumbing: that a ship writes every pending physical line with the
 * tracking, audits the order, and queues the customer message; that one
 * refused order does not stop the others and is named with the machine's
 * reason; that a deliver which empties the order rolls the status to
 * `fulfilled` through the override policy (CAS on the source status, audit
 * row) and leaves a partially delivered order alone; that cancel runs the
 * shared core per order; and that the permission refusal runs nothing.
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

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (...a: unknown[]) => requireSection(...a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const { shipOrders, deliverOrders, cancelOrders } = await import('./fulfillment')

const A = '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f'
const B = '4c7f7a2f-0d3b-4c8f-9e4a-2b3c4d5e6f70'
const USER = '22222222-2222-4222-8222-222222222222'
const ADMIN = '11111111-1111-4111-8111-111111111111'

function order(
  id: string,
  status: string,
  lines: { id: string; product_type: string; item_status: string; tracking?: string }[],
) {
  return {
    id,
    status,
    notes: null,
    user_id: USER,
    address_id: null,
    order_items: lines.map((l) => ({
      id: l.id,
      product_type: l.product_type,
      item_status: l.item_status,
      carrier: null,
      tracking_number: l.tracking ?? null,
    })),
  }
}

function findAll(table: string, op: string): Call[] {
  return calls.filter((c) => c.table === table && c.op === op)
}

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  vi.clearAllMocks()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
  queue('profiles.select', {
    data: { email: 'dana@example.com', full_name: 'דנה', phone: '0521234567' },
    error: null,
  })
})

describe('shipOrders', () => {
  it('ships every pending physical line with the tracking, audits, and queues both channels', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [
        { id: 'l1', product_type: 'physical', item_status: 'pending' },
        { id: 'l2', product_type: 'physical', item_status: 'pending' },
        { id: 'l3', product_type: 'coupon', item_status: 'issued' },
      ]),
      error: null,
    })
    queue('order_items.update', { data: [{ id: 'l1' }, { id: 'l2' }], error: null })

    const result = await shipOrders([{ orderId: A, carrier: 'חבילה פלוס', trackingNumber: 'IL1' }])

    expect(result).toEqual({ done: [A], skipped: [], notified: 1 })
    expect(requireSection).toHaveBeenCalledWith('orders', 'write')

    const update = findAll('order_items', 'update')[0]
    expect(update?.payload).toMatchObject({
      item_status: 'shipped',
      carrier: 'חבילה פלוס',
      tracking_number: 'IL1',
    })
    expect(update?.chain).toContainEqual(['in', ['id', ['l1', 'l2']]])
    expect(update?.chain).toContainEqual(['eq', ['item_status', 'pending']])

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_change',
        entityType: 'orders',
        entityId: A,
        changes: expect.objectContaining({
          item_status: { from: 'pending', to: 'shipped' },
          lines: ['l1', 'l2'],
          tracking_number: 'IL1',
        }),
      }),
    )

    const mail = findAll('notification_outbox', 'insert')[0]
    expect(mail?.payload).toMatchObject({
      kind: 'order_shipped',
      recipient_email: 'dana@example.com',
      dedupe_key: `order-shipped:${A}`,
      payload: expect.objectContaining({
        order_ref: A.slice(0, 8).toUpperCase(),
        customer_name: 'דנה',
        item_count: 3,
        shipments: [
          { carrier: 'חבילה פלוס', tracking_number: 'IL1' },
          { carrier: 'חבילה פלוס', tracking_number: 'IL1' },
        ],
      }),
    })
    expect(rpcCalls).toContainEqual({
      fn: 'fn_enqueue_whatsapp',
      args: expect.objectContaining({
        p_kind: 'order_shipped',
        p_phone: '0521234567',
        p_dedupe: `wa:order_shipped:${A}`,
      }),
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/orders/${A}`)
  })

  it('names a refused order with the machine reason and still ships the others', async () => {
    queue(
      'orders.select',
      {
        data: order(A, 'pending', [{ id: 'l1', product_type: 'physical', item_status: 'pending' }]),
        error: null,
      },
      {
        data: order(B, 'paid', [{ id: 'l2', product_type: 'physical', item_status: 'pending' }]),
        error: null,
      },
    )
    queue('order_items.update', { data: [{ id: 'l2' }], error: null })

    const result = await shipOrders([{ orderId: A }, { orderId: B, trackingNumber: 'X' }])

    expect(result.done).toEqual([B])
    expect(result.skipped).toEqual([{ orderId: A, reason: expect.stringContaining('לא שולמה') }])
    expect(findAll('order_items', 'update')).toHaveLength(1)
  })

  it('a coupon-only order and an already shipped order are skipped, not failed', async () => {
    queue(
      'orders.select',
      {
        data: order(A, 'paid', [{ id: 'l1', product_type: 'coupon', item_status: 'issued' }]),
        error: null,
      },
      {
        data: order(B, 'paid', [{ id: 'l2', product_type: 'physical', item_status: 'shipped' }]),
        error: null,
      },
    )
    const result = await shipOrders([{ orderId: A }, { orderId: B }])
    expect(result.done).toEqual([])
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'אין בהזמנה שורות מוצר פיזי לשליחה',
      'כל השורות כבר נשלחו',
    ])
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('a concurrent change (zero rows moved) is reported, and nothing is queued', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [{ id: 'l1', product_type: 'physical', item_status: 'pending' }]),
      error: null,
    })
    queue('order_items.update', { data: [], error: null })
    const result = await shipOrders([{ orderId: A }])
    expect(result.skipped[0]?.reason).toContain('השתנו בינתיים')
    expect(findAll('notification_outbox', 'insert')).toHaveLength(0)
  })

  it('a WhatsApp CHECK refusal (252 not applied) is logged and the mail still goes', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [{ id: 'l1', product_type: 'physical', item_status: 'pending' }]),
      error: null,
    })
    queue('order_items.update', { data: [{ id: 'l1' }], error: null })
    queue('rpc.fn_enqueue_whatsapp', { data: null, error: { code: '23514', message: 'check' } })
    const result = await shipOrders([{ orderId: A, trackingNumber: 'T' }])
    expect(result).toEqual({ done: [A], skipped: [], notified: 1 })
    expect(logWarn).toHaveBeenCalledWith(
      'fulfillment.whatsapp_kind_not_accepted',
      expect.anything(),
    )
  })

  it('a duplicate mail (trigger got there first) is not a failure', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [{ id: 'l1', product_type: 'physical', item_status: 'pending' }]),
      error: null,
    })
    queue('order_items.update', { data: [{ id: 'l1' }], error: null })
    queue('notification_outbox.insert', {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    const result = await shipOrders([{ orderId: A }])
    expect(result.done).toEqual([A])
    expect(logWarn).not.toHaveBeenCalledWith(
      'fulfillment.shipped_email_enqueue_failed',
      expect.anything(),
    )
  })

  it('refuses without the orders write permission and runs nothing', async () => {
    requireSection.mockRejectedValue(new Error('NEXT_REDIRECT'))
    const result = await shipOrders([{ orderId: A }])
    expect(result).toEqual({ done: [], skipped: [], error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
  })

  it('rejects a malformed batch before touching the database', async () => {
    const result = await shipOrders([{ orderId: 'not-a-uuid' }])
    expect(result.error).toBe('קלט לא תקין')
    expect(calls).toHaveLength(0)
  })
})

describe('deliverOrders', () => {
  it('delivers the shipped lines and rolls the emptied order to fulfilled through the override', async () => {
    queue('orders.select', {
      data: order(A, 'partially_fulfilled', [
        { id: 'l1', product_type: 'physical', item_status: 'shipped', tracking: 'X' },
        { id: 'l2', product_type: 'physical', item_status: 'delivered' },
        { id: 'l3', product_type: 'physical', item_status: 'cancelled' },
      ]),
      error: null,
    })
    queue('order_items.update', { data: [{ id: 'l1' }], error: null })
    queue('orders.update', { data: { id: A }, error: null })

    const result = await deliverOrders([A])
    expect(result).toEqual({ done: [A], skipped: [], notified: 1 })

    // The delivered mail, once the fold closed: through the RPC, keyed on
    // the order, with the user id so the in-app bell rings.
    const delivered = rpcCalls.find(
      (c) =>
        c.fn === 'fn_enqueue_notification' &&
        (c.args as { p_kind: string }).p_kind === 'order_delivered',
    )
    expect(delivered?.args).toMatchObject({
      p_email: 'dana@example.com',
      p_dedupe: `order-delivered:${A}`,
      p_user_id: USER,
      p_payload: expect.objectContaining({ order_id: A, item_count: 3 }),
    })

    const lineUpdate = findAll('order_items', 'update')[0]
    expect(lineUpdate?.payload).toMatchObject({ item_status: 'delivered' })
    expect(lineUpdate?.chain).toContainEqual(['eq', ['item_status', 'shipped']])

    const statusUpdate = findAll('orders', 'update')[0]
    expect(statusUpdate?.payload).toMatchObject({ status: 'fulfilled' })
    expect(statusUpdate?.chain).toContainEqual(['eq', ['status', 'partially_fulfilled']])
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manual_override',
        changes: { status: { from: 'partially_fulfilled', to: 'fulfilled' } },
      }),
    )
  })

  it('leaves the order status alone while a parcel is still pending', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [
        { id: 'l1', product_type: 'physical', item_status: 'shipped' },
        { id: 'l2', product_type: 'physical', item_status: 'pending' },
      ]),
      error: null,
    })
    queue('order_items.update', { data: [{ id: 'l1' }], error: null })
    const result = await deliverOrders([A])
    expect(result.done).toEqual([A])
    expect(findAll('orders', 'update')).toHaveLength(0)
    // And no "delivered" mail yet: a parcel is still on its way.
    expect(rpcCalls.filter((c) => c.fn === 'fn_enqueue_notification')).toHaveLength(0)
  })

  it('a lost CAS on the status is logged, not fatal: the lines were delivered', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [{ id: 'l1', product_type: 'physical', item_status: 'shipped' }]),
      error: null,
    })
    queue('order_items.update', { data: [{ id: 'l1' }], error: null })
    queue('orders.update', { data: null, error: null })
    const result = await deliverOrders([A])
    expect(result.done).toEqual([A])
    expect(logWarn).toHaveBeenCalledWith(
      'fulfillment.order_fulfil_after_delivery_failed',
      expect.anything(),
    )
  })

  it('skips an order with nothing shipped, with a reason', async () => {
    queue('orders.select', {
      data: order(A, 'paid', [{ id: 'l1', product_type: 'physical', item_status: 'pending' }]),
      error: null,
    })
    const result = await deliverOrders([A])
    expect(result.skipped).toEqual([{ orderId: A, reason: expect.stringContaining('נשלחו') }])
  })
})

describe('cancelOrders', () => {
  it('runs the shared pending cancel per order and names the paid one', async () => {
    queue(
      'orders.select',
      { data: { id: A, status: 'pending', notes: null }, error: null },
      { data: { id: B, status: 'paid', notes: null }, error: null },
    )
    const result = await cancelOrders([A, B], 'הלקוח ביקש')
    expect(result.done).toEqual([A])
    expect(result.skipped).toEqual([{ orderId: B, reason: expect.stringContaining('ההחזרים') }])
    expect(rpcCalls.map((c) => c.fn)).toEqual(['release_order_stock', 'release_order_discount'])
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
  })

  it('demands a reason', async () => {
    const result = await cancelOrders([A], 'x')
    expect(result.error).toContain('סיבת ביטול')
    expect(calls).toHaveLength(0)
  })
})
