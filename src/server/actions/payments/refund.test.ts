import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of the refund, which is where [48] found the whole gap: the
 * pure planner was already correct and the provider already took the flag, but
 * the code between them named three columns the database does not have.
 *
 * Everything here is driven through a fake Supabase client rather than a real
 * one, because the failures worth catching are all shape failures — which
 * column was named, which row was written, and in which order relative to the
 * provider call that moves real money.
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
  // The last queued result is sticky, so a table read more times than it was
  // scripted keeps answering rather than silently turning into an empty row.
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

/**
 * A postgrest-shaped stub: every builder method chains, and the builder itself
 * is awaitable. The chain is recorded verbatim so a test can assert on the
 * exact filters a write carried — `.eq('settlement_status', from)` is the
 * difference between a replay-safe update and one that stomps a raced row.
 */
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

/** `rpc:<name>` is not a real table; it just gives the call an identity in `calls`. */
function rpcCall(name: string, payload: unknown): Promise<Result> {
  calls.push({ table: `rpc:${name}`, op: 'rpc', payload, chain: [] })
  return Promise.resolve(settle(`rpc.${name}`))
}

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
    upsert: (payload: unknown) => builder(table, 'upsert', payload),
  }),
  rpc: (name: string, payload: unknown) => rpcCall(name, payload),
}

const requireAdminSession = vi.fn()
const refundByTransactionId = vi.fn()
const capturePaymentError = vi.fn()
const enqueueRefundCreditNote = vi.fn()
const issueQueuedInvoice = vi.fn()

/**
 * Overridable only for the one blocker-message test: `describeRefundBlockers`
 * always finds a blocker whenever `planOrderRefund`'s own consumed-voucher
 * check fires (same input, same rule), so the `??` fallback string in
 * `refund.ts` has no real-data path to it. Everything else runs the actual
 * domain function.
 */
let describeRefundBlockersImpl:
  | typeof import('@/server/domain/orders/refund').describeRefundBlockers
  | null = null

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/payments', () => ({
  getPaymentProvider: () => ({ refundByTransactionId }),
}))
vi.mock('@/lib/observability/sentry', () => ({
  capturePaymentError: (...args: unknown[]) => capturePaymentError(...args),
}))
vi.mock('@/server/payments/invoices', () => ({
  enqueueRefundCreditNote: (...args: unknown[]) => enqueueRefundCreditNote(...args),
  issueQueuedInvoice: (...args: unknown[]) => issueQueuedInvoice(...args),
}))
vi.mock('@/server/domain/orders/refund', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domain/orders/refund')>()
  return {
    ...actual,
    describeRefundBlockers: (...args: Parameters<typeof actual.describeRefundBlockers>) =>
      (describeRefundBlockersImpl ?? actual.describeRefundBlockers)(...args),
  }
})

import { refundOrder } from './refund'

/** The pre-059 hosted project: `amount_agorot` does not exist. */
const NO_AGOROT_COLUMN: Result = { data: null, error: { code: '42703', message: 'no such column' } }
const HAS_AGOROT_COLUMN: Result = { data: null, error: null }

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

/** The payment lookup, which is the SECOND `payments.select` — the first is the
 * schema probe. Throws rather than returning undefined so a test that stops
 * reaching the lookup fails on the missing call and not on a null read. */
function paymentLookup(): Call {
  const lookups = calls.filter((c) => c.table === 'payments' && c.op === 'select')
  const lookup = lookups[1]
  if (!lookup) throw new Error(`no payment lookup: only ${lookups.length} payments.select calls`)
  return lookup
}

function seedHappyPath(overrides: { succeededAt?: string | null; items?: unknown[] } = {}): void {
  queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
  queue('payments.select', NO_AGOROT_COLUMN, {
    data: {
      id: 'pay-1',
      amount_ils: 100,
      cardcom_transaction_id: 'tx-9',
      status: 'succeeded',
      cardcom_account_id: 'acct-1',
      succeeded_at: overrides.succeededAt === undefined ? null : overrides.succeededAt,
    },
    error: null,
  })
  queue('order_items.select', {
    data: overrides.items ?? [
      {
        id: 'line-1',
        product_type: 'physical',
        settlement_status: 'paid',
        supplier_id: 'sup-1',
        supplier_immediate_agorot: 0,
      },
    ],
    error: null,
  })
  queue('vouchers.select', { data: [], error: null })
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  requireAdminSession.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
  capturePaymentError.mockReset()
  refundByTransactionId.mockReset().mockResolvedValue({
    success: true,
    refundTransactionId: 'refund-tx-1',
    refundedAgorot: 9_500,
    failureCode: null,
    failureMessage: null,
    raw: {},
  })
  enqueueRefundCreditNote
    .mockReset()
    .mockResolvedValue({ enqueued: false, reason: 'not queued in test' })
  issueQueuedInvoice.mockReset().mockResolvedValue(undefined)
  describeRefundBlockersImpl = null
  __resetPaymentMoneySchemaCache()
})

describe('refundOrder: the columns this database actually has', () => {
  it('reads the charge through the shekel column when the agorot one is absent', async () => {
    // The bug this closes: the select named `amount_agorot`, which raises 42703
    // and takes down the WHOLE statement, so `data` came back null and every
    // refund in production answered "no payment to refund" — on every order,
    // before Cardcom was ever reached.
    seedHappyPath()
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })

    expect(result.ok).toBe(true)
    const lookup = paymentLookup()
    expect(lookup.payload).toContain('amount_ils')
    expect(lookup.payload).not.toContain('amount_agorot')
    // ₪100 charged, 5% fee = ₪95 back.
    expect(refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ amountAgorot: 9_500, transactionId: 'tx-9' }),
    )
  })

  it('reads the agorot column on a database that has been through 059', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', HAS_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_agorot: 10_000,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    queue('order_items.select', {
      data: [{ id: 'line-1', product_type: 'physical', settlement_status: 'paid' }],
      error: null,
    })
    queue('vouchers.select', { data: [], error: null })

    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result.ok).toBe(true)
    expect(paymentLookup().payload).toContain('amount_agorot')
  })

  it('asks for succeeded_at and never for paid_at', async () => {
    // `paid_at` is a column of `orders`. Naming it on `payments` is the same
    // 42703 as above, and it would have taken the payment lookup down with it.
    seedHappyPath()
    await refundOrder({ orderId: 'order-1', reason: 'test' })
    const lookup = paymentLookup()
    expect(lookup.payload).toContain('succeeded_at')
    expect(lookup.payload).not.toContain('paid_at')
  })

  it('writes the refund row against the charge it reverses', async () => {
    seedHappyPath()
    await refundOrder({ orderId: 'order-1', reason: 'test' })
    const insert = find('payments', 'insert')?.payload as Record<string, unknown>
    expect(insert.refund_of_payment_id).toBe('pay-1')
    expect(insert.kind).toBe('refund')
    expect(insert.amount_ils).toBe(95)
    expect(insert.idempotency_key).toBe('refund:pay-1')
  })
})

describe('refundOrder: same-day cancellation', () => {
  it('asks Cardcom to cancel a deal charged today, with no fee', async () => {
    const now = new Date('2026-08-06T15:00:00Z')
    seedHappyPath({ succeededAt: '2026-08-06T09:00:00Z' })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test', now })

    expect(refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ cancelOnly: true, amountAgorot: 10_000 }),
    )
    expect(result).toMatchObject({ ok: true, cancelOnly: true, refundedIls: 100, feeIls: 0 })
  })

  it('credits, with the fee, once the clearing day has turned', async () => {
    const now = new Date('2026-08-07T15:00:00Z')
    seedHappyPath({ succeededAt: '2026-08-06T09:00:00Z' })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test', now })

    expect(refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ cancelOnly: false, amountAgorot: 9_500 }),
    )
    expect(result).toMatchObject({ ok: true, cancelOnly: false, feeIls: 5 })
  })

  it('takes the credit path when the charge never recorded a success time', async () => {
    seedHappyPath({ succeededAt: null })
    await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ cancelOnly: false }),
    )
  })

  it('takes the credit path on an unparseable success time rather than throwing', async () => {
    seedHappyPath({ succeededAt: 'not a date' })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result.ok).toBe(true)
    expect(refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ cancelOnly: false }),
    )
  })
})

describe('refundOrder: supplier debits', () => {
  it('journals the released share of a split line as a supplier_debit', async () => {
    seedHappyPath({
      items: [
        {
          id: 'line-1',
          product_type: 'physical',
          settlement_status: 'split_executed',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 7_000,
        },
      ],
    })
    await refundOrder({ orderId: 'order-1', reason: 'test' })

    const events = find('settlement_events', 'upsert')?.payload as Record<string, unknown>[]
    const debit = events.find((e) => e.kind === 'supplier_debit')
    expect(debit).toMatchObject({
      order_item_id: 'line-1',
      supplier_id: 'sup-1',
      // Positive: 094's CHECK refuses negatives, so the direction is the kind.
      supplier_due_agorot: 7_000,
      idempotency_key: 'supplier_debit:line-1',
    })
  })

  it('journals a debit for a line refunded BEFORE the split, marked unreleased', async () => {
    // The common case, and the one that used to write no debit at all: a
    // customer cancels days after paying, long before any payout run moves the
    // line to `split_executed`. `charge_settled` had already credited the
    // supplier's share, `supplierObligations` computes
    // `earned - debited - settled`, and with no debit the supplier's open
    // balance kept the full ₪70 on a sale that was refunded.
    seedHappyPath({
      items: [
        {
          id: 'line-1',
          product_type: 'physical',
          settlement_status: 'paid',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 7_000,
        },
      ],
    })
    await refundOrder({ orderId: 'order-1', reason: 'test' })

    const events = find('settlement_events', 'upsert')?.payload as Record<string, unknown>[]
    const debit = events.find((e) => e.kind === 'supplier_debit')
    expect(debit).toMatchObject({
      order_item_id: 'line-1',
      supplier_due_agorot: 7_000,
      idempotency_key: 'supplier_debit:line-1',
      // How the money comes back differs even though both are debited: an
      // unreleased share is simply never paid, a released one is netted off the
      // next payout. The ledger has to be able to tell them apart afterwards,
      // because the line reads `refunded` in both cases.
      metadata: { payment_id: 'pay-1', reason: 'refund', released: false },
    })
  })

  it('journals the refund itself even when nothing is owed back', async () => {
    seedHappyPath()
    await refundOrder({ orderId: 'order-1', reason: 'test' })

    const events = find('settlement_events', 'upsert')?.payload as Record<string, unknown>[]
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'refund_issued',
      paid_on_site_agorot: 9_500,
      idempotency_key: 'refund_issued:pay-1',
    })
  })

  it('names the admin who refunded in the audit row, not "an admin, unknown which"', async () => {
    // requireAdminSession() knows exactly who this is; the row used to write
    // actor_id: null anyway (BUSINESS-RULES §10, fixed marathon step 11). A
    // money reversal whose log names nobody is a statement, not evidence.
    seedHappyPath()
    await refundOrder({ orderId: 'order-1', reason: 'test' })

    const audit = find('audit_log', 'insert')?.payload as Record<string, unknown>
    expect(audit).toMatchObject({
      actor_id: 'admin-1',
      actor_role: 'admin',
      action: 'status_change',
      entity_type: 'order',
    })
  })

  it('selects the supplier columns the debit is computed from', async () => {
    // Without these two in the select, every debit silently computes to zero
    // and the supplier keeps a share the customer has been given back.
    seedHappyPath()
    await refundOrder({ orderId: 'order-1', reason: 'test' })
    const select = find('order_items', 'select')?.payload as string
    expect(select).toContain('supplier_id')
    expect(select).toContain('supplier_immediate_agorot')
  })
})

describe('refundOrder: refusals', () => {
  it('answers MANUAL_RESOLUTION on a redeemed voucher, in Hebrew', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: 100,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    queue('order_items.select', {
      data: [{ id: 'line-1', product_type: 'coupon', settlement_status: 'paid' }],
      error: null,
    })
    queue('vouchers.select', { data: [{ id: 'v1', status: 'redeemed' }], error: null })

    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'MANUAL_RESOLUTION' })
    expect(result.ok === false && result.error).toContain('מומשו')
    // The refusal has to happen BEFORE the money moves.
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('refuses without hitting the provider when the order is not paid', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'pending' }, error: null })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'STATE_INVALID' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('replays an already-refunded order as a no-op', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'refunded' }, error: null })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: true, replay: true, refundedIls: 0 })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('refuses a zero credit before the provider round trip', async () => {
    // `payments.amount_ils` carries CHECK (> 0), so this would otherwise be a
    // provider call followed by a constraint violation with the money moved.
    seedHappyPath()
    const result = await refundOrder({ orderId: 'order-1', reason: 'test', partialAmountIls: 0 })
    expect(result).toMatchObject({ ok: false, code: 'STATE_INVALID' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('raises the alarm when the provider declines', async () => {
    seedHappyPath()
    refundByTransactionId.mockResolvedValue({
      success: false,
      refundTransactionId: null,
      refundedAgorot: 0,
      failureCode: '55',
      failureMessage: 'declined',
      raw: {},
    })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'PROVIDER_ERROR' })
    expect(capturePaymentError).toHaveBeenCalled()
    expect(find('payments', 'insert')).toBeUndefined()
  })

  it('raises the alarm when the books fail after the card was credited', async () => {
    // The one failure on this path a human has to see: the money is already
    // back with the customer and our records no longer say so.
    seedHappyPath()
    queues.set('payments.insert', [{ data: null, error: null }])
    const boom = new Error('constraint violation')
    const original = adminClient.from
    adminClient.from = ((table: string) => {
      if (table === 'payments') {
        return {
          ...original(table),
          insert: () => {
            throw boom
          },
        }
      }
      return original(table)
    }) as typeof adminClient.from

    try {
      const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
      expect(result).toMatchObject({ ok: false, code: 'INTERNAL' })
      expect(capturePaymentError).toHaveBeenCalledWith(
        boom,
        expect.objectContaining({ stage: 'refund_persist' }),
      )
    } finally {
      adminClient.from = original
    }
  })

  it('refuses a caller who is not an admin', async () => {
    requireAdminSession.mockRejectedValue(new Error('nope'))
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(calls).toHaveLength(0)
  })

  it('answers NOT_FOUND when the order itself does not exist', async () => {
    queue('orders.select', { data: null, error: null })
    const result = await refundOrder({ orderId: 'missing', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('answers NOT_FOUND when the order has no charge to refund', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, { data: null, error: null })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, error: 'לא נמצא תשלום לזיכוי', code: 'NOT_FOUND' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('refuses a payment with no Cardcom transaction id', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: 100,
        cardcom_transaction_id: null,
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'STATE_INVALID' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('refuses a payment whose charged amount cannot be read', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: null,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({
      ok: false,
      error: 'לתשלום אין סכום קריא',
      code: 'STATE_INVALID',
    })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('refuses an order with no line items', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: 100,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    queue('order_items.select', { data: [], error: null })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, error: 'להזמנה אין פריטים', code: 'STATE_INVALID' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('treats a null vouchers read the same as no vouchers', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: 100,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    queue('order_items.select', {
      data: [
        {
          id: 'line-1',
          product_type: 'physical',
          settlement_status: 'paid',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 0,
        },
      ],
      error: null,
    })
    queue('vouchers.select', { data: null, error: null })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result.ok).toBe(true)
  })

  it('answers STATE_INVALID from the planner when no line can be refunded', async () => {
    // Every line already `redeemed` (goods consumed at the old coupon_codes
    // model): the state machine has no REFUND edge out of it, so the planner
    // throws RefundError rather than silently refunding nothing.
    seedHappyPath({
      items: [
        {
          id: 'line-1',
          product_type: 'physical',
          settlement_status: 'redeemed',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 0,
        },
      ],
    })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'STATE_INVALID' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('lets a non-RefundError from planning propagate rather than swallowing it', async () => {
    // NaN.toFixed(2) is the string "NaN", which ilsToAgorot rejects with a
    // plain TypeError -- not a RefundError -- while still inside the planner's
    // try block. That error must reach the caller, not be reported as a
    // refusal the admin could retry past.
    seedHappyPath()
    await expect(
      refundOrder({ orderId: 'order-1', reason: 'test', partialAmountIls: Number.NaN }),
    ).rejects.toThrow(/decimal/)
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('falls back to the generic Hebrew message when describeRefundBlockers finds nothing', async () => {
    // Defensive-only: describeRefundBlockers always reports a blocker whenever
    // the consumed-voucher check above it fires on the same data, so this path
    // is exercised by forcing the helper's return value directly.
    describeRefundBlockersImpl = () => []
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: 100,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    queue('order_items.select', {
      data: [{ id: 'line-1', product_type: 'coupon', settlement_status: 'paid' }],
      error: null,
    })
    queue('vouchers.select', { data: [{ id: 'v1', status: 'redeemed' }], error: null })

    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({
      ok: false,
      code: 'MANUAL_RESOLUTION',
      error: 'שוברים שכבר מומשו או פגו דורשים טיפול ידני',
    })
  })

  it('answers MANUAL_RESOLUTION on an expired voucher too, not only a redeemed one', async () => {
    queue('orders.select', { data: { id: 'order-1', status: 'paid' }, error: null })
    queue('payments.select', NO_AGOROT_COLUMN, {
      data: {
        id: 'pay-1',
        amount_ils: 100,
        cardcom_transaction_id: 'tx-9',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: null,
      },
      error: null,
    })
    queue('order_items.select', {
      data: [{ id: 'line-1', product_type: 'coupon', settlement_status: 'paid' }],
      error: null,
    })
    queue('vouchers.select', { data: [{ id: 'v1', status: 'expired' }], error: null })

    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({ ok: false, code: 'MANUAL_RESOLUTION' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('raises the alarm with the fallback message when Cardcom declines without one', async () => {
    seedHappyPath()
    refundByTransactionId.mockResolvedValue({
      success: false,
      refundTransactionId: null,
      refundedAgorot: 0,
      failureCode: null,
      failureMessage: null,
      raw: {},
    })
    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
    expect(result).toMatchObject({
      ok: false,
      code: 'PROVIDER_ERROR',
      error: 'הזיכוי נדחה על ידי Cardcom',
    })
    expect(capturePaymentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ detail: expect.objectContaining({ failure_code: null }) }),
    )
  })

  it('raises the alarm on a non-Error thrown value after the card was credited', async () => {
    seedHappyPath()
    const original = adminClient.from
    adminClient.from = ((table: string) => {
      if (table === 'payments') {
        return {
          ...original(table),
          insert: () => {
            throw 'constraint violation'
          },
        }
      }
      return original(table)
    }) as typeof adminClient.from

    try {
      const result = await refundOrder({ orderId: 'order-1', reason: 'test' })
      expect(result).toMatchObject({
        ok: false,
        code: 'INTERNAL',
        error: 'refund persistence failed',
      })
      expect(capturePaymentError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ stage: 'refund_persist' }),
      )
    } finally {
      adminClient.from = original
    }
  })

  it('refunds an issued voucher back to the card and marks it refunded', async () => {
    seedHappyPath({
      items: [{ id: 'line-1', product_type: 'coupon', settlement_status: 'paid' }],
    })
    queues.set('vouchers.select', [{ data: [{ id: 'v1', status: 'issued' }], error: null }])

    await refundOrder({ orderId: 'order-1', reason: 'test' })

    const update = find('vouchers', 'update')
    expect(update?.payload).toMatchObject({ status: 'refunded' })
    expect(update?.chain).toContainEqual(['in', ['id', ['v1']]])
  })

  it('queues the credit note and issues it once the refund payment row has an id', async () => {
    seedHappyPath()
    queues.set('payments.insert', [{ data: { id: 'refund-pay-1' }, error: null }])
    enqueueRefundCreditNote.mockResolvedValue({ enqueued: true, replay: false, invoiceId: 'inv-1' })

    await refundOrder({ orderId: 'order-1', reason: 'test' })

    expect(enqueueRefundCreditNote).toHaveBeenCalledWith(
      adminClient,
      expect.objectContaining({ orderId: 'order-1', refundPaymentId: 'refund-pay-1' }),
    )
    expect(issueQueuedInvoice).toHaveBeenCalledWith(adminClient, 'inv-1')
  })

  it('does not issue an invoice for a credit note that was only a replay', async () => {
    seedHappyPath()
    queues.set('payments.insert', [{ data: { id: 'refund-pay-1' }, error: null }])
    enqueueRefundCreditNote.mockResolvedValue({ enqueued: true, replay: true, invoiceId: 'inv-1' })

    await refundOrder({ orderId: 'order-1', reason: 'test' })

    expect(issueQueuedInvoice).not.toHaveBeenCalled()
  })

  it('does not issue an invoice the queue refused', async () => {
    seedHappyPath()
    queues.set('payments.insert', [{ data: { id: 'refund-pay-1' }, error: null }])
    enqueueRefundCreditNote.mockResolvedValue({ enqueued: false, reason: 'nothing_refunded' })

    await refundOrder({ orderId: 'order-1', reason: 'test' })

    expect(issueQueuedInvoice).not.toHaveBeenCalled()
  })

  it('notifies the customer by profile email when the order has a user', async () => {
    seedHappyPath({
      items: [
        {
          id: 'line-1',
          product_type: 'physical',
          settlement_status: 'paid',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 0,
        },
      ],
    })
    queues.set('orders.select', [
      { data: { id: 'order-1', status: 'paid', user_id: 'user-1' }, error: null },
    ])
    queue('profiles.select', { data: { email: 'customer@example.com' }, error: null })

    await refundOrder({ orderId: 'order-1', reason: 'test' })

    const rpc = calls.find((c) => c.table === 'rpc:fn_enqueue_notification')
    expect(rpc?.payload).toMatchObject({ p_email: 'customer@example.com', p_user_id: 'user-1' })
  })

  it('sends an empty email and logs when the notification enqueue itself errors', async () => {
    seedHappyPath({
      items: [
        {
          id: 'line-1',
          product_type: 'physical',
          settlement_status: 'paid',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 0,
        },
      ],
    })
    queues.set('orders.select', [
      { data: { id: 'order-1', status: 'paid', user_id: 'user-1' }, error: null },
    ])
    queue('profiles.select', { data: null, error: null })
    queue('rpc.fn_enqueue_notification', { data: null, error: { message: 'outbox down' } })

    const result = await refundOrder({ orderId: 'order-1', reason: 'test' })

    expect(result.ok).toBe(true)
    const rpc = calls.find((c) => c.table === 'rpc:fn_enqueue_notification')
    expect(rpc?.payload).toMatchObject({ p_email: '' })
  })
})
