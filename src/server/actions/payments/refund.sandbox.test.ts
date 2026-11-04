import { MockCardcomProvider, getPaymentProvider } from '@/lib/payments'
import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S13: the refund reaches the payment adapter in SANDBOX, not a stub.
 *
 * `refund.test.ts` replaces `@/lib/payments` with a spy, which proves what the
 * action asked for and nothing about whether the adapter it really resolves
 * answers. Here `@/lib/payments` is the real module: `getPaymentProvider`
 * reads the environment, picks the shared sandbox provider (no Cardcom
 * credentials exist in any environment this repo reaches, docs/S13-cancel.md),
 * and its refund id is what lands in `payments` and `refunds`. Only the
 * database, the session and the invoice queue are faked.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown }

const calls: Call[] = []
const results = new Map<string, Result[]>()

function answer(key: string): Result {
  const q = results.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  calls.push({ table, op, payload })
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown) => Promise.resolve(answer(key)).then(resolve)
        }
        return () =>
          prop === 'maybeSingle' || prop === 'single' ? Promise.resolve(answer(key)) : proxy
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    select: (cols: unknown) => builder(table, 'select', cols),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
    upsert: (payload: unknown) => builder(table, 'upsert', payload),
  }),
  rpc: () => Promise.resolve({ data: null, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireAdminSession: () => Promise.resolve({ userId: 'admin-1', role: 'admin' }),
}))
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentError: () => undefined }))
vi.mock('@/server/payments/invoices', () => ({
  enqueueRefundCreditNote: () => Promise.resolve({ enqueued: false }),
  issueQueuedInvoice: () => Promise.resolve(undefined),
}))
vi.mock('@/server/analytics/track', () => ({ trackServerEvent: () => Promise.resolve() }))

import { refundOrder } from './refund'

const NOW = new Date('2026-11-04T10:00:00Z')

function seed(succeededAt: string | null): void {
  results.set('orders.select', [
    {
      data: { id: 'order-1', status: 'paid', user_id: null, paid_at: '2026-11-01T10:00:00Z' },
      error: null,
    },
  ])
  results.set('payments.select', [
    { data: null, error: { code: '42703', message: 'no amount_agorot' } },
    {
      data: {
        id: 'pay-1',
        amount_ils: 250,
        cardcom_transaction_id: 'mock-charge-1',
        status: 'succeeded',
        cardcom_account_id: null,
        succeeded_at: succeededAt,
      },
      error: null,
    },
  ])
  results.set('order_items.select', [
    {
      data: [
        {
          id: 'line-1',
          product_type: 'coupon',
          settlement_status: 'paid',
          supplier_id: 'sup-1',
          supplier_immediate_agorot: 0,
        },
      ],
      error: null,
    },
  ])
  results.set('vouchers.select', [
    { data: [{ id: 'v-1', status: 'issued', redeemed_at: null }], error: null },
  ])
  results.set('payments.insert', [{ data: { id: 'refund-pay-1' }, error: null }])
}

const inserted = (table: string) =>
  calls.find((c) => c.table === table && c.op === 'insert')?.payload as Record<string, unknown>

beforeEach(() => {
  calls.length = 0
  results.clear()
  __resetPaymentMoneySchemaCache()
})

describe('refundOrder against the sandbox payment adapter (S13)', () => {
  it('resolves the sandbox provider in this environment', () => {
    expect(getPaymentProvider(null)).toBeInstanceOf(MockCardcomProvider)
  })

  it('credits through the adapter and stores the adapter’s refund id', async () => {
    seed('2026-11-01T10:00:00Z')
    const result = await refundOrder({ orderId: 'order-1', reason: 'התחרטתי', now: NOW })

    // ₪250 = 25,000 agorot; 5% = 1,250 agorot fee, under the ₪100 cap.
    expect(result).toMatchObject({ ok: true, refundedAgorot: 23_750, feeAgorot: 1_250 })
    const refundPayment = inserted('payments')
    expect(refundPayment.cardcom_transaction_id).toMatch(/^mock-refund-\d+$/)
    expect(refundPayment).toMatchObject({ kind: 'refund', refund_of_payment_id: 'pay-1' })
    expect(inserted('refunds')).toMatchObject({
      state: 'completed',
      requested_agorot: 25_000,
      granted_agorot: 23_750,
      cancellation_fee_agorot: 1_250,
    })
  })

  it('a same-day cancellation asks the adapter to cancel, not credit', async () => {
    seed('2026-11-04T08:00:00Z')
    const result = await refundOrder({ orderId: 'order-1', reason: 'התחרטתי', now: NOW })

    expect(result).toMatchObject({ ok: true, cancelOnly: true, refundedAgorot: 25_000 })
    expect(inserted('payments').cardcom_transaction_id).toMatch(/^mock-cancel-\d+$/)
  })
})
