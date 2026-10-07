import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Refund as store credit. `planWalletCredit` is proven pure in
 * refund-wallet.test.ts; what can only fail here is the orchestration: the
 * customer's wallet row is claimed (not duplicated) BEFORE the ledger moves,
 * the transfer debits platform:revenue and credits the customer on the
 * per-order idempotency key, the row settles with the credited amount, a
 * full cancellation moves the order's states and a goodwill credit does
 * not, and a failed transfer releases the lock as `failed`.
 */

type Result = { data: unknown; error: { code?: string; message: string } | null }
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
      get(_t, prop) {
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
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
    upsert: (payload: unknown) => builder(table, 'upsert', payload),
  }),
  rpc: (fn: string, args: unknown) => builder(`rpc:${fn}`, 'rpc', args),
}

const requireAdminSession = vi.fn()
const getOpenReturnForOrder = vi.fn()
const capturePaymentError = vi.fn()
const trackServerEvent = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/server/queries/returns', () => ({
  getOpenReturnForOrder: (...args: unknown[]) => getOpenReturnForOrder(...args),
}))
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentError: (...args: unknown[]) => capturePaymentError(...args),
}))
vi.mock('@/server/analytics/track', () => ({
  trackServerEvent: (...args: unknown[]) => trackServerEvent(...args),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { refundToWallet } from './refund-wallet'

const NOW = new Date('2026-10-08T10:00:00.000Z')

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}
function all(table: string, op: string): Call[] {
  return calls.filter((c) => c.table === table && c.op === op)
}

const WALLET_REQUEST = {
  id: 'ref-1',
  orderId: 'order-1',
  rma: 'RMA-261008-REF1',
  state: 'requested',
  ground: 'distance_sale_14d',
  reasonCode: 'changed_mind',
  destination: 'wallet',
  note: null,
  requestedAgorot: 10_000,
  grantedAgorot: null,
  cancellationFeeAgorot: 0,
  requestedAt: NOW.toISOString(),
  decidedAt: null,
  completedAt: null,
  refundDueBy: '2026-10-22T10:00:00.000Z',
  internalNote: null,
}

function seed(overrides: { vouchers?: unknown[]; items?: unknown[]; userId?: string | null } = {}) {
  queue('orders.select', {
    data: {
      id: 'order-1',
      status: 'paid',
      user_id: overrides.userId === undefined ? 'user-1' : overrides.userId,
    },
    error: null,
  })
  queue('order_items.select', {
    data: overrides.items ?? [
      {
        id: 'line-1',
        product_type: 'coupon',
        settlement_status: 'paid',
        supplier_id: 'sup-1',
        supplier_immediate_agorot: 0,
      },
    ],
    error: null,
  })
  queue('vouchers.select', {
    data: overrides.vouchers ?? [{ id: 'v1', status: 'issued' }],
    error: null,
  })
  queue('payments.select', { data: { id: 'pay-1' }, error: null })
  queue('refunds.update', { data: [{ id: 'ref-1' }], error: null })
  queue(
    'wallet_accounts.select',
    { data: { id: 'wa-user' }, error: null },
    { data: { id: 'wa-platform' }, error: null },
  )
  queue('rpc:fn_wallet_transfer.rpc', { data: 'tx-1', error: null })
  queue('orders.update', { data: { id: 'order-1' }, error: null })
  queue('profiles.select', { data: { email: 'dana@example.com' }, error: null })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  vi.clearAllMocks()
  requireAdminSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  getOpenReturnForOrder.mockResolvedValue(WALLET_REQUEST)
})

describe('refundToWallet: guards before the lock', () => {
  it('refuses without an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('redirect'))
    expect(await refundToWallet({ orderId: 'order-1', reason: 'x' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('reports a missing order, and a replay on one already refunded', async () => {
    queue('orders.select', { data: null, error: null })
    expect(await refundToWallet({ orderId: 'order-1', reason: 'x' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    calls.length = 0
    queues.clear()
    queue('orders.select', {
      data: { id: 'order-1', status: 'refunded', user_id: 'user-1' },
      error: null,
    })
    expect(await refundToWallet({ orderId: 'order-1', reason: 'x' })).toMatchObject({
      ok: true,
      replay: true,
    })
    expect(find('rpc:fn_wallet_transfer', 'rpc')).toBeUndefined()
  })

  it('refuses a guest order: there is no wallet to credit', async () => {
    seed({ userId: null })
    expect(await refundToWallet({ orderId: 'order-1', reason: 'x' })).toMatchObject({
      ok: false,
      code: 'NO_WALLET',
    })
  })

  it('refuses when the open request asks for the card instead', async () => {
    getOpenReturnForOrder.mockResolvedValue({ ...WALLET_REQUEST, destination: 'original_method' })
    seed()
    const out = await refundToWallet({ orderId: 'order-1', reason: 'x' })
    expect(out).toMatchObject({ ok: false, code: 'MANUAL_RESOLUTION' })
    expect(find('refunds', 'update')).toBeUndefined()
  })

  it('needs an amount when there is no open request', async () => {
    getOpenReturnForOrder.mockResolvedValue(null)
    seed()
    expect(await refundToWallet({ orderId: 'order-1', reason: 'x' })).toMatchObject({
      ok: false,
      code: 'STATE_INVALID',
    })
  })
})

describe('refundToWallet: the customer’s wallet request, approved', () => {
  it('claims the row in executing before the ledger moves, then settles it completed', async () => {
    seed()
    let rowsClaimedWhenTransferred = 0
    queues.set('rpc:fn_wallet_transfer.rpc', [
      {
        data: 'tx-1',
        // The action destructures `error`, so the probe sits on it.
        get error() {
          rowsClaimedWhenTransferred = all('refunds', 'update').length
          return null
        },
      },
    ])
    const out = await refundToWallet({ orderId: 'order-1', reason: 'אישור', now: NOW })
    expect(out).toEqual({
      ok: true,
      replay: false,
      orderId: 'order-1',
      creditedAgorot: 10_000,
      goodwill: false,
    })
    expect(rowsClaimedWhenTransferred).toBe(1)

    const claim = all('refunds', 'update')[0]
    expect(claim?.payload).toMatchObject({
      state: 'executing',
      granted_agorot: 10_000,
      cancellation_fee_agorot: 0,
      decided_by: 'admin-1',
    })
    expect(claim?.chain.map(([m, a]) => [m, ...a])).toEqual(
      expect.arrayContaining([
        ['in', 'state', ['requested', 'approved']],
        ['eq', 'destination', 'wallet'],
      ]),
    )
    expect(all('refunds', 'insert')).toHaveLength(0)

    const settled = all('refunds', 'update')[1]
    expect(settled?.payload).toMatchObject({ state: 'completed', granted_agorot: 10_000 })
  })

  it('debits platform:revenue and credits the customer, in shekels, on the per-order key', async () => {
    seed()
    await refundToWallet({ orderId: 'order-1', reason: 'אישור', now: NOW })
    const transfer = find('rpc:fn_wallet_transfer', 'rpc')
    expect(transfer?.payload).toEqual({
      p_debit_account: 'wa-platform',
      p_credit_account: 'wa-user',
      p_amount_ils: 100,
      p_reason: 'refund_wallet',
      p_idempotency: 'refund:order-1:wallet',
      p_order_id: 'order-1',
    })
    const platformRead = all('wallet_accounts', 'select')[1]
    expect(platformRead?.chain).toContainEqual(['eq', ['code', 'platform:revenue']])
  })

  it('moves the voucher, the line and the order, restocks, journals, audits and notifies', async () => {
    seed()
    await refundToWallet({ orderId: 'order-1', reason: 'אישור', now: NOW })
    expect(find('vouchers', 'update')?.payload).toMatchObject({ status: 'refunded' })
    expect(find('order_items', 'update')?.payload).toEqual({
      settlement_status: 'refunded',
      item_status: 'refunded',
    })
    const flip = find('orders', 'update')
    expect(flip?.payload).toEqual({ status: 'refunded' })
    expect(flip?.chain).toContainEqual(['eq', ['status', 'paid']])
    expect(find('rpc:restock_order_stock', 'rpc')?.payload).toEqual({ p_order_id: 'order-1' })
    const journal = find('settlement_events', 'upsert')?.payload as Record<string, unknown>[]
    expect(journal[0]).toMatchObject({
      kind: 'refund_issued',
      paid_on_site_agorot: 10_000,
      idempotency_key: 'refund_issued:refund:order-1:wallet',
    })
    expect(find('audit_log', 'insert')?.payload).toMatchObject({
      actor_id: 'admin-1',
      metadata: expect.objectContaining({
        source: 'refund_to_wallet',
        rma: 'RMA-261008-REF1',
        goodwill: false,
      }),
    })
    expect(find('rpc:fn_enqueue_notification', 'rpc')?.payload).toMatchObject({
      p_kind: 'refund_completed',
      p_email: 'dana@example.com',
      p_dedupe: 'refund:order-1',
      p_payload: expect.objectContaining({ destination: 'wallet', refunded_agorot: 10_000 }),
    })
    expect(trackServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'order_refunded',
        props: expect.objectContaining({ destination: 'wallet' }),
      }),
    )
  })

  it('credits a redeemed coupon as goodwill: money moves, states do not', async () => {
    seed({ vouchers: [{ id: 'v1', status: 'redeemed' }] })
    const out = await refundToWallet({ orderId: 'order-1', reason: 'מחווה', now: NOW })
    expect(out).toMatchObject({ ok: true, goodwill: true, creditedAgorot: 10_000 })
    expect(find('rpc:fn_wallet_transfer', 'rpc')).toBeDefined()
    expect(all('refunds', 'update')[0]?.payload).toMatchObject({ ground: 'goodwill' })
    expect(find('vouchers', 'update')).toBeUndefined()
    expect(find('order_items', 'update')).toBeUndefined()
    expect(find('orders', 'update')).toBeUndefined()
    expect(find('settlement_events', 'upsert')).toBeUndefined()
    expect(find('rpc:fn_enqueue_notification', 'rpc')).toBeDefined()
  })

  it('refuses when the claim finds no row to take (someone else decided first)', async () => {
    seed()
    queues.set('refunds.update', [{ data: [], error: null }])
    const out = await refundToWallet({ orderId: 'order-1', reason: 'x', now: NOW })
    expect(out).toMatchObject({ ok: false, code: 'MANUAL_RESOLUTION' })
    expect(find('rpc:fn_wallet_transfer', 'rpc')).toBeUndefined()
  })

  it('releases the lock as failed when the ledger refuses, and reports INTERNAL', async () => {
    seed()
    queues.set('rpc:fn_wallet_transfer.rpc', [{ data: null, error: { message: 'insufficient' } }])
    const out = await refundToWallet({ orderId: 'order-1', reason: 'x', now: NOW })
    expect(out).toMatchObject({ ok: false, code: 'INTERNAL' })
    expect(all('refunds', 'update')[1]?.payload).toMatchObject({ state: 'failed' })
    expect(find('orders', 'update')).toBeUndefined()
    expect(capturePaymentError).toHaveBeenCalled()
  })
})

describe('refundToWallet: an admin goodwill credit with no request', () => {
  it('opens its own executing row with destination wallet and the given amount', async () => {
    getOpenReturnForOrder.mockResolvedValue(null)
    seed()
    queue('refunds.insert', { data: null, error: null })
    const out = await refundToWallet({
      orderId: 'order-1',
      reason: 'פיצוי',
      amountAgorot: 2_500,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: true, creditedAgorot: 2_500 })
    expect(find('refunds', 'insert')?.payload).toMatchObject({
      state: 'executing',
      destination: 'wallet',
      ground: 'goodwill',
      requested_agorot: 2_500,
      granted_agorot: 2_500,
      cancellation_fee_agorot: 0,
      reason_he: 'פיצוי',
    })
    expect(find('rpc:fn_wallet_transfer', 'rpc')?.payload).toMatchObject({ p_amount_ils: 25 })
  })

  it('refuses when a refund is already open on the order', async () => {
    getOpenReturnForOrder.mockResolvedValue(null)
    seed()
    queue('refunds.insert', { data: null, error: { code: '23505', message: 'duplicate key' } })
    const out = await refundToWallet({
      orderId: 'order-1',
      reason: 'x',
      amountAgorot: 2_500,
      now: NOW,
    })
    expect(out).toMatchObject({ ok: false, code: 'MANUAL_RESOLUTION' })
    expect(find('rpc:fn_wallet_transfer', 'rpc')).toBeUndefined()
  })
})
