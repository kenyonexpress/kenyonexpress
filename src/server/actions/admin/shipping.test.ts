import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The per-line shipping action, and specifically its STEP 16 tail: after a
 * `deliver` it re-reads the order's lines and mails the customer once, when
 * the fold says the last parcel landed. The transition machine is real; the
 * database is a queue of canned answers keyed by `table.op`.
 */

type Result = { data: unknown; error: { code?: string; message: string } | null }
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
  }),
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve(settle(`rpc.${fn}`))
  },
}

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }))
vi.mock('@/lib/admin/rbac', () => ({ requireSection: (...a: unknown[]) => requireSection(...a) }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { markItemDelivered, markItemShipped } = await import('./shipping')

const ITEM = '5d8e7f2a-1b3c-4d5e-8f6a-7b8c9d0e1f2a'
const ORDER = '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f'
const USER = '22222222-2222-4222-8222-222222222222'

function line(item_status: string, product_type = 'physical') {
  return { product_type, item_status, tracking_number: null, carrier: null }
}

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  vi.clearAllMocks()
  requireSection.mockResolvedValue({ userId: 'admin', role: 'admin' })
  queue('profiles.select', { data: { email: 'dana@example.com', full_name: 'דנה' }, error: null })
})

function deliverable() {
  // The read before the write, then the CAS write itself.
  queue('order_items.select', {
    data: {
      id: ITEM,
      item_status: 'shipped',
      product_type: 'physical',
      order_id: ORDER,
      orders: { status: 'paid', user_id: USER },
    },
    error: null,
  })
  queue('order_items.update', { data: { id: ITEM }, error: null })
}

describe('markItemDelivered', () => {
  it('mails the customer once the last live parcel is delivered', async () => {
    deliverable()
    // The re-read after the write: every other physical line already landed,
    // the coupon and the cancelled line do not count.
    queue('order_items.select', {
      data: [line('delivered'), line('delivered'), line('issued', 'coupon'), line('cancelled')],
      error: null,
    })

    expect(await markItemDelivered(ITEM)).toMatchObject({ ok: true })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0]?.args).toMatchObject({
      p_kind: 'order_delivered',
      p_email: 'dana@example.com',
      p_dedupe: `order-delivered:${ORDER}`,
      p_user_id: USER,
      p_payload: expect.objectContaining({ order_id: ORDER, item_count: 4 }),
    })
  })

  it('stays quiet while a sibling parcel is still on its way', async () => {
    deliverable()
    queue('order_items.select', { data: [line('delivered'), line('shipped')], error: null })

    expect(await markItemDelivered(ITEM)).toMatchObject({ ok: true })
    expect(rpcCalls).toHaveLength(0)
  })

  it('reports success even when the re-read fails: the status is already set', async () => {
    deliverable()
    queue('order_items.select', { data: null, error: { message: 'timeout' } })

    expect(await markItemDelivered(ITEM)).toMatchObject({ ok: true })
    expect(rpcCalls).toHaveLength(0)
  })

  it('reports success when the constraint refuses the kind ahead of 253', async () => {
    deliverable()
    queue('order_items.select', { data: [line('delivered')], error: null })
    queue('rpc.fn_enqueue_notification', {
      data: null,
      error: { code: '23514', message: 'violates check constraint' },
    })

    expect(await markItemDelivered(ITEM)).toMatchObject({ ok: true })
    expect(logWarn).toHaveBeenCalledWith(
      'fulfillment.delivered_kind_not_accepted',
      expect.objectContaining({ orderId: ORDER }),
    )
  })
})

describe('markItemShipped', () => {
  it('never mails from the per-line ship: the trigger and the board own that', async () => {
    queue('order_items.select', {
      data: {
        id: ITEM,
        item_status: 'pending',
        product_type: 'physical',
        order_id: ORDER,
        orders: { status: 'paid', user_id: USER },
      },
      error: null,
    })
    queue('order_items.update', { data: { id: ITEM }, error: null })

    expect(await markItemShipped(ITEM, 'דואר ישראל', 'RR1')).toMatchObject({
      ok: true,
      trackingStored: true,
    })
    expect(rpcCalls).toHaveLength(0)
    // And no second read of the lines: the fold is only consulted on deliver.
    expect(calls.filter((c) => c.table === 'order_items' && c.op === 'select')).toHaveLength(1)
  })
})
