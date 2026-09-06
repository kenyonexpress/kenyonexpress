import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The wallet refund, driven through a fake Supabase client for the same reason
 * `refund.test.ts` is: the failures worth catching are shape failures. Which
 * column was named, which row was written, what the transfer carried, and
 * above all what happens on the SECOND call, because the second call is a
 * double credit if the replay guard is wrong.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()
const rpcCalls: { fn: string; args: unknown }[] = []
let rpcResult: { data: unknown; error: unknown } = { data: 'entry-1', error: null }

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

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
  }),
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve(rpcResult)
  },
}

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const capturePaymentError = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (...a: unknown[]) => writeAuditLog(...a) }))
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentError: (...a: unknown[]) => capturePaymentError(...a),
}))

import { refundOrderToWallet } from './refund-to-wallet'

const NO_AGOROT_COLUMN: Result = { data: null, error: { code: '42703', message: 'no such column' } }

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

function seed(
  overrides: {
    userId?: string | null
    amountIls?: number
    existingEntry?: unknown
    houseAccount?: unknown
  } = {},
): void {
  queue('orders.select', {
    data: {
      id: 'order-1',
      status: 'paid',
      user_id: overrides.userId === undefined ? 'user-1' : overrides.userId,
    },
    error: null,
  })
  queue('payments.select', NO_AGOROT_COLUMN, {
    data: { id: 'pay-1', amount_ils: overrides.amountIls ?? 100, status: 'succeeded' },
    error: null,
  })
  queue('wallet_entries.select', { data: overrides.existingEntry ?? null, error: null })
  queue('wallet_accounts.select', { data: { id: 'wallet-user-1' }, error: null })
  // The house account read is the second wallet_accounts.select; the sticky
  // last-result rule in `settle` would otherwise hand it the user's row.
  queue('wallet_accounts.select', {
    data: overrides.houseAccount === undefined ? { id: 'wallet-house' } : overrides.houseAccount,
    error: null,
  })
  queue('refunds.insert', { data: null, error: null })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  rpcCalls.length = 0
  rpcResult = { data: 'entry-1', error: null }
  requireAdminSession.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  writeAuditLog.mockReset().mockResolvedValue(undefined)
  capturePaymentError.mockReset()
  __resetPaymentMoneySchemaCache()
})

describe('refundOrderToWallet', () => {
  it('credits the wallet from the adjustments house account, in shekels, keyed to the order', async () => {
    seed()
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'שובר מומש' })

    expect(result).toEqual({ ok: true, replay: false, orderId: 'order-1', creditedIls: 100 })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0]?.fn).toBe('fn_wallet_transfer')
    expect(rpcCalls[0]?.args).toEqual({
      // The house account is DEBITED and the customer CREDITED. Reversed, this
      // takes money out of a customer's wallet and calls it a refund.
      p_debit_account: 'wallet-house',
      p_credit_account: 'wallet-user-1',
      p_amount_ils: 100,
      p_reason: 'refund_to_wallet',
      p_idempotency: 'refund:order-1:wallet',
      p_order_id: 'order-1',
    })
  })

  it('writes the statutory record with destination wallet and no fee', async () => {
    seed()
    await refundOrderToWallet({ orderId: 'order-1', reason: 'שובר פג' })

    const insert = find('refunds', 'insert')
    expect(insert?.payload).toMatchObject({
      order_id: 'order-1',
      payment_id: 'pay-1',
      state: 'completed',
      // A wallet credit for consumed value is goodwill, not a distance sale.
      ground: 'goodwill',
      destination: 'wallet',
      cancellation_fee_agorot: 0,
      granted_agorot: 10_000,
      requested_agorot: 10_000,
    })
  })

  it('files a defect claim under defect, still with no fee', async () => {
    seed()
    await refundOrderToWallet({ orderId: 'order-1', reason: 'פגם', isDefectClaim: true })
    expect(find('refunds', 'insert')?.payload).toMatchObject({
      ground: 'defect',
      cancellation_fee_agorot: 0,
    })
  })

  it('does not credit twice when the entry for this key already exists', async () => {
    // THE TEST THIS FILE EXISTS FOR. fn_wallet_transfer returns the existing
    // entry id on a replay, which is indistinguishable from a fresh transfer at
    // the call site, so the guard has to be the read before it. Without it a
    // second click writes a second `refunds` row against one credit and the
    // statutory record says the customer was paid twice.
    seed({ existingEntry: { id: 'entry-1' } })
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'שוב' })

    expect(result).toEqual({ ok: true, replay: true, orderId: 'order-1', creditedIls: 0 })
    expect(rpcCalls).toHaveLength(0)
    expect(find('refunds', 'insert')).toBeUndefined()
  })

  it('refuses a guest order rather than inventing a wallet', async () => {
    seed({ userId: null })
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })
    expect(result).toEqual({
      ok: false,
      error: 'הזמנת אורח: אין ארנק לזכות. יש לזכות לאמצעי התשלום המקורי',
      code: 'GUEST_ORDER',
    })
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuses a credit larger than the charge', async () => {
    seed({ amountIls: 50 })
    const result = await refundOrderToWallet({
      orderId: 'order-1',
      reason: 'החזר',
      partialAmountIls: 60,
    })
    expect(result).toEqual({ ok: false, error: 'סכום הזיכוי גדול מהחיוב', code: 'STATE_INVALID' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('credits a partial amount when one is given', async () => {
    seed({ amountIls: 100 })
    const result = await refundOrderToWallet({
      orderId: 'order-1',
      reason: 'החזר חלקי',
      partialAmountIls: 25.5,
    })
    expect(result).toMatchObject({ ok: true, creditedIls: 25.5 })
    expect(rpcCalls[0]?.args).toMatchObject({ p_amount_ils: 25.5 })
    expect(find('refunds', 'insert')?.payload).toMatchObject({
      requested_agorot: 2550,
      granted_agorot: 2550,
    })
  })

  it('refuses when the house account is missing instead of improvising one', async () => {
    seed({ houseAccount: null })
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })
    expect(result).toEqual({ ok: false, error: 'חשבונות הארנק חסרים', code: 'INTERNAL' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('reports a failed transfer as a failure and writes no record', async () => {
    seed()
    rpcResult = { data: null, error: { message: 'insufficient wallet balance' } }
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })

    expect(result).toEqual({ ok: false, error: 'הזיכוי לארנק נכשל', code: 'INTERNAL' })
    expect(find('refunds', 'insert')).toBeUndefined()
    expect(capturePaymentError).toHaveBeenCalled()
  })

  it('refuses when the replay probe itself fails, rather than reading it as "not yet credited"', async () => {
    // A PostgREST read never rejects: it resolves with { data: null, error }.
    // Taking only `data` here would turn a transient read failure into "no
    // previous credit" and credit a second time, which is the one outcome in
    // this file that cannot be undone without taking money back out of a
    // customer's wallet.
    seed()
    queues.set('wallet_entries.select', [{ data: null, error: { message: 'connection reset' } }])
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })

    expect(result).toEqual({
      ok: false,
      error: 'בדיקת הכפילות נכשלה. נסה שוב',
      code: 'INTERNAL',
    })
    expect(rpcCalls).toHaveLength(0)
  })

  it('reports a failed order read as a failure, not as a missing order', async () => {
    queues.set('orders.select', [{ data: null, error: { message: 'boom' } }])
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })
    expect(result).toEqual({ ok: false, error: 'קריאת ההזמנה נכשלה', code: 'INTERNAL' })
  })

  it('refuses without an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('no session'))
    const result = await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })
    expect(result).toEqual({ ok: false, error: 'אין הרשאה', code: 'FORBIDDEN' })
    expect(calls).toHaveLength(0)
  })

  it('reads the charge through the shekel column on the pre-059 database', async () => {
    seed()
    await refundOrderToWallet({ orderId: 'order-1', reason: 'החזר' })
    const lookups = calls.filter((c) => c.table === 'payments' && c.op === 'select')
    expect(lookups[1]?.payload).toContain('amount_ils')
    expect(lookups[1]?.payload).not.toContain('amount_agorot')
  })
})
