import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The customer cancellation control, driven through fake Supabase clients.
 *
 * What is worth catching here is not the arithmetic -- `refund-request.test.ts`
 * owns that -- but the shape: WHICH client read the order (the user's, so RLS
 * is the ownership check rather than a comparison this file has to remember),
 * what the written row actually contains, and that the row is a notice and
 * never a money movement.
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

function clientFor(prefix: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(`${prefix}${table}`, 'select', args[0]),
      insert: (payload: unknown) => builder(`${prefix}${table}`, 'insert', payload),
      update: (payload: unknown) => builder(`${prefix}${table}`, 'update', payload),
    }),
  }
}

// Distinct namespaces on purpose: a test that passes because the admin client
// answered a read the USER client was supposed to make would be hiding the
// ownership check disappearing.
const adminClient = clientFor('')
let currentUser: { id: string } | null = { id: 'user-1' }
const userClient = {
  ...clientFor('u:'),
  auth: { getUser: async () => ({ data: { user: currentUser } }) },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => userClient }))

const checkRateLimit = vi.fn()
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requestOrderRefund } from './request-refund'

const NO_AGOROT_COLUMN: Result = { data: null, error: { code: '42703', message: 'no such column' } }

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

function seed(
  overrides: {
    status?: string
    paidAt?: string | null
    openRefund?: unknown
    voucherStatus?: string
    priorAutoApprovals?: { decided_at: string }[]
    insert?: Result
  } = {},
): void {
  queue('u:orders.select', {
    data: {
      id: 'order-1',
      status: overrides.status ?? 'paid',
      paid_at: overrides.paidAt === undefined ? new Date().toISOString() : overrides.paidAt,
    },
    error: null,
  })
  queue('refunds.select', { data: overrides.openRefund ?? null, error: null })
  queue('payments.select', NO_AGOROT_COLUMN, {
    data: { id: 'pay-1', amount_ils: 200, succeeded_at: new Date().toISOString() },
    error: null,
  })
  queue('order_items.select', {
    data: [
      {
        id: 'item-1',
        product_type: 'coupon',
        settlement_status: 'paid',
        supplier_id: 'sup-1',
        supplier_immediate_agorot: 0,
      },
    ],
    error: null,
  })
  queue('vouchers.select', {
    data: [{ id: 'v-1', status: overrides.voucherStatus ?? 'issued' }],
    error: null,
  })
  // The auto-approval budget read is the SECOND refunds.select.
  queue('refunds.select', { data: overrides.priorAutoApprovals ?? [], error: null })
  queue('refunds.insert', overrides.insert ?? { data: { id: 'refund-1' }, error: null })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  currentUser = { id: 'user-1' }
  checkRateLimit.mockReset().mockResolvedValue(true)
  __resetPaymentMoneySchemaCache()
})

describe('requestOrderRefund', () => {
  it('records an auto-approved notice for a clean in-window cancellation', async () => {
    seed()
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })

    expect(result).toMatchObject({ ok: true, state: 'approved', autoApproved: true })
    const insert = find('refunds', 'insert')
    expect(insert?.payload).toMatchObject({
      order_id: 'order-1',
      payment_id: 'pay-1',
      state: 'approved',
      ground: 'distance_sale_14d',
      destination: 'original_method',
      requested_by: 'user-1',
      requested_agorot: 20_000,
      cancellation_fee_agorot: 1_000,
    })
  })

  it('leaves decided_by unset on a machine decision, and decided_at set', async () => {
    // This pair IS the auto-approval record: 131 requires `decided_at` on an
    // approved row and leaves `decided_by` nullable, so "decided with nobody
    // behind it" is representable -- and countable next time.
    seed()
    await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    const payload = find('refunds', 'insert')?.payload as Record<string, unknown>
    expect(payload.decided_at).toEqual(expect.any(String))
    expect(payload.decided_by).toBeUndefined()
  })

  it('reads the order on the USER client so RLS is the ownership check', async () => {
    seed()
    await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(find('u:orders', 'select')).toBeDefined()
    expect(find('orders', 'select')).toBeUndefined()
  })

  it('writes a requested row and names the reason when a voucher was redeemed', async () => {
    seed({ voucherStatus: 'redeemed' })
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })

    expect(result).toMatchObject({ ok: true, state: 'requested', autoApproved: false })
    const payload = find('refunds', 'insert')?.payload as Record<string, unknown>
    expect(payload.state).toBe('requested')
    expect(payload.decided_at).toBeNull()
    expect(payload.internal_note).toContain('value_consumed')
  })

  it('stops auto-approving once three machine decisions stand for this customer', async () => {
    const recent = new Date().toISOString()
    seed({
      priorAutoApprovals: [{ decided_at: recent }, { decided_at: recent }, { decided_at: recent }],
    })
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(result).toMatchObject({ ok: true, state: 'requested' })
    expect((find('refunds', 'insert')?.payload as Record<string, unknown>).internal_note).toContain(
      'auto_approval_limit_reached',
    )
  })

  it('counts only decisions with no person behind them', async () => {
    seed()
    await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    const budgetRead = calls.filter((c) => c.table === 'refunds' && c.op === 'select')[1]
    expect(budgetRead?.chain).toContainEqual(['is', ['decided_by', null]])
    expect(budgetRead?.chain).toContainEqual(['eq', ['requested_by', 'user-1']])
  })

  it('sends a discretionary ground to the wallet and never auto-approves it', async () => {
    seed()
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'goodwill' })
    expect(result).toMatchObject({ autoApproved: false })
    expect(find('refunds', 'insert')?.payload).toMatchObject({ destination: 'wallet' })
  })

  it('refuses an unauthenticated caller before touching anything', async () => {
    currentUser = null
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
    expect(calls).toHaveLength(0)
  })

  it('refuses an unpaid order', async () => {
    seed({ status: 'pending' })
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(result).toMatchObject({ ok: false, code: 'NOT_PAID' })
    expect(find('refunds', 'insert')).toBeUndefined()
  })

  it('refuses a second notice while one is open', async () => {
    seed({ openRefund: { id: 'refund-open' } })
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_OPEN' })
    expect(find('refunds', 'insert')).toBeUndefined()
  })

  it('turns the partial unique index into the same answer as the pre-check', async () => {
    // The pre-check loses the race on a double-click; 23505 is the index
    // winning it, and the customer must see one story, not two.
    seed({ insert: { data: null, error: { code: '23505', message: 'duplicate key' } } })
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_OPEN' })
  })

  it('rate limits per customer', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    expect(result).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(calls).toHaveLength(0)
  })

  it('never writes to payments, wallet_entries or orders: a notice is not a credit', async () => {
    seed()
    await requestOrderRefund({ orderId: 'order-1', ground: 'distance_sale_14d' })
    const writes = calls.filter((c) => c.op === 'insert' || c.op === 'update')
    expect(writes.map((w) => `${w.table}.${w.op}`)).toEqual(['refunds.insert'])
  })
})
