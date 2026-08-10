import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The queue between the money path and the provider.
 *
 * Driven through a fake Supabase client, like `refund.test.ts` and for the same
 * reason: the failures worth catching here are shape failures. Which amount the
 * document was built from, whether a replay wrote a second tax document,
 * whether a machine with no credentials burns the queue's retries, and whether
 * `orders.invoice_number` - four readers and no writer until [55] - is finally
 * written.
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

/** Every RPC the module makes, recorded so the admin alert can be asserted. */
const rpcCalls: { name: string; args: Record<string, unknown> }[] = []

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
    upsert: (payload: unknown) => builder(table, 'upsert', payload),
  }),
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    return { data: null, error: null }
  },
}

const createDocument = vi.fn()
vi.mock('@/lib/payments', () => ({
  getPaymentProvider: (accountId?: string | null) => ({
    createDocument: (input: unknown) => createDocument(input, accountId),
  }),
}))
vi.mock('@/lib/storage/r2', () => ({
  isR2Configured: () => false,
  createR2PresignedPutUrl: async () => ({ uploadUrl: '', publicUrl: '' }),
  r2PublicUrl: (key: string) => key,
}))

import {
  backoffMinutes,
  documentIssuingMode,
  enqueueOrderInvoice,
  enqueueRefundCreditNote,
  invoiceIdempotencyKey,
  issueInvoice,
} from './invoices'

/** The pre-059 hosted project: `amount_agorot` does not exist. */
const NO_AGOROT_COLUMN: Result = { data: null, error: { code: '42703', message: 'no such column' } }

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}
function findAll(table: string, op: string): Call[] {
  return calls.filter((c) => c.table === table && c.op === op)
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222'

/**
 * A paid order: two coupons at ₪50 each on the site, ₪10 of wallet credit
 * spent, so the card moved ₪90.
 */
function scriptPaidOrder(
  options: { chargedIls?: number; walletIls?: number; productType?: string } = {},
): void {
  queue('payments.select', NO_AGOROT_COLUMN)
  queue('payments.select', {
    data: {
      id: PAYMENT_ID,
      status: 'succeeded',
      cardcom_transaction_id: 'deal-77',
      cardcom_account_id: 'platform',
      amount_ils: options.chargedIls ?? 90,
    },
    error: null,
  })
  queue('orders.select', {
    data: { id: ORDER_ID, user_id: 'user-1', cashback_applied_ils: options.walletIls ?? 10 },
    error: null,
  })
  queue('order_items.select', {
    data: [
      {
        product_id: 'p1',
        product_type: options.productType ?? 'coupon',
        quantity: 2,
        paid_on_site_agorot: 10_000,
        balance_due_agorot: 4_000,
      },
    ],
    error: null,
  })
  queue('products.select', { data: [{ id: 'p1', name_he: 'ארוחה זוגית' }], error: null })
  queue('profiles.select', {
    data: { email: 'dana@example.com', full_name: 'דנה', phone: '050' },
    error: null,
  })
}

beforeEach(() => {
  rpcCalls.length = 0
  calls.length = 0
  queues.clear()
  createDocument.mockReset()
  __resetPaymentMoneySchemaCache()
})

describe('invoiceIdempotencyKey', () => {
  it('keys the sale on the order and the credit note on the refund payment', () => {
    // finalize is replay-safe and can run twice for one order, so the receipt
    // has to collide with itself. A refund is its own event.
    expect(invoiceIdempotencyKey('tax_invoice_receipt', { orderId: 'o' })).toBe(
      'order:o:tax_invoice_receipt',
    )
    expect(invoiceIdempotencyKey('credit_note', { orderId: 'o', paymentId: 'p' })).toBe(
      'payment:p:credit_note',
    )
  })
})

describe('documentIssuingMode', () => {
  it('will not let the mock stamp a document number onto a real order', () => {
    // The normal state of a developer's machine: no terminal, not production,
    // and `loadCardcomEnv` calls that mock. This project runs against the
    // hosted database, so issuing there would write `mock-doc-3` as a real
    // order's INVOICE NUMBER.
    expect(documentIssuingMode({ NODE_ENV: 'development' } as unknown as NodeJS.ProcessEnv)).toBe(
      'unconfigured',
    )
    expect(
      documentIssuingMode({
        NODE_ENV: 'development',
        CARDCOM_USE_MOCK: 'true',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe('mock')
  })

  it('is ready only with both credentials', () => {
    expect(
      documentIssuingMode({
        NODE_ENV: 'production',
        CARDCOM_TERMINAL_NUMBER: '1000',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe('unconfigured')
    expect(
      documentIssuingMode({
        NODE_ENV: 'production',
        CARDCOM_TERMINAL_NUMBER: '1000',
        CARDCOM_API_NAME: 'api',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe('ready')
  })
})

describe('enqueueOrderInvoice', () => {
  it('queues the document for the amount that actually moved, not the order total', async () => {
    // ₪100 of lines, ₪10 wallet, ₪90 charged. A receipt for ₪100 would not
    // match the customer's card statement.
    scriptPaidOrder({ productType: 'physical' })
    queue('invoices.insert', { data: { id: 'inv-1' }, error: null })

    const result = await enqueueOrderInvoice(adminClient as never, {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    })
    expect(result).toEqual({ enqueued: true, invoiceId: 'inv-1', replay: false })
    const insert = find('invoices', 'insert')?.payload as Record<string, unknown>
    expect(insert.total_agorot).toBe(9_000)
    expect(insert.net_agorot).toBe(7_627)
    expect(insert.vat_agorot).toBe(1_373)
    expect((insert.net_agorot as number) + (insert.vat_agorot as number)).toBe(9_000)
    expect(insert.idempotency_key).toBe(`order:${ORDER_ID}:tax_invoice_receipt`)
  })

  it('classifies a coupon-only order as a receipt with no VAT stated', async () => {
    // 116: the coupon payment is an ADVANCE for something consumed later at a
    // counter, so no VAT event has occurred. Same money, same total, different
    // document - and the CHECK net + vat = total still holds.
    scriptPaidOrder({ productType: 'coupon' })
    queue('invoices.insert', { data: { id: 'inv-2' }, error: null })

    await enqueueOrderInvoice(adminClient as never, { orderId: ORDER_ID, paymentId: PAYMENT_ID })
    const insert = find('invoices', 'insert')?.payload as Record<string, unknown>
    expect(insert.document_type).toBe('coupon_receipt')
    expect(insert.total_agorot).toBe(9_000)
    expect(insert.vat_agorot).toBe(0)
    expect(insert.net_agorot).toBe(9_000)
  })

  it('keys both sale documents the same, so a reclassification cannot queue two', async () => {
    // An order owes exactly ONE sale document. A key that named the type would
    // let a coupon receipt and a tax invoice both exist for one card charge.
    scriptPaidOrder({ productType: 'coupon' })
    queue('invoices.insert', { data: { id: 'inv-3' }, error: null })

    await enqueueOrderInvoice(adminClient as never, { orderId: ORDER_ID, paymentId: PAYMENT_ID })
    const insert = find('invoices', 'insert')?.payload as Record<string, unknown>
    expect(insert.idempotency_key).toBe(`order:${ORDER_ID}:tax_invoice_receipt`)
  })

  it('treats a unique violation as the replay it is', async () => {
    scriptPaidOrder()
    queue('invoices.insert', { data: null, error: { code: '23505', message: 'duplicate key' } })
    queue('invoices.select', { data: { id: 'inv-existing' }, error: null })

    const result = await enqueueOrderInvoice(adminClient as never, {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    })
    expect(result).toEqual({ enqueued: true, invoiceId: 'inv-existing', replay: true })
  })

  it('writes nothing for a wallet-covered order, which has no deal to attach to', async () => {
    const result = await enqueueOrderInvoice(adminClient as never, {
      orderId: ORDER_ID,
      paymentId: null,
    })
    expect(result).toEqual({ enqueued: false, reason: 'no_payment' })
    expect(find('invoices', 'insert')).toBeUndefined()
  })

  it('survives a database without 107 instead of failing the finalize that called it', async () => {
    scriptPaidOrder()
    queue('invoices.insert', {
      data: null,
      error: { code: '42P01', message: 'relation "public.invoices" does not exist' },
    })
    const result = await enqueueOrderInvoice(adminClient as never, {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    })
    expect(result).toEqual({ enqueued: false, reason: 'table_missing' })
  })

  it('refuses to queue a document whose lines cannot describe the charge', async () => {
    // ₪100 of lines and ₪10 of wallet cannot produce a ₪120 charge; the
    // residual discount would be negative. Better a queue nobody drained than a
    // tax document nobody can explain.
    scriptPaidOrder({ chargedIls: 120 })
    const result = await enqueueOrderInvoice(adminClient as never, {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
    })
    expect(result.enqueued).toBe(false)
    expect(find('invoices', 'insert')).toBeUndefined()
  })
})

describe('enqueueRefundCreditNote', () => {
  it('splits VAT out of the refunded amount and keys on the refund payment', async () => {
    queue('invoices.insert', { data: { id: 'inv-cn' }, error: null })
    const result = await enqueueRefundCreditNote(adminClient as never, {
      orderId: ORDER_ID,
      refundPaymentId: 'refund-pay-1',
      refundedAgorot: 5_900,
      reason: 'ביטול',
    })
    expect(result).toEqual({ enqueued: true, invoiceId: 'inv-cn', replay: false })
    const insert = find('invoices', 'insert')?.payload as Record<string, unknown>
    expect(insert.document_type).toBe('credit_note')
    expect(insert.total_agorot).toBe(5_900)
    expect(insert.idempotency_key).toBe('payment:refund-pay-1:credit_note')
  })

  it('does not queue a document for nothing', async () => {
    const result = await enqueueRefundCreditNote(adminClient as never, {
      orderId: ORDER_ID,
      refundPaymentId: 'refund-pay-1',
      refundedAgorot: 0,
      reason: 'ביטול',
    })
    expect(result).toEqual({ enqueued: false, reason: 'nothing_refunded' })
  })
})

describe('issueInvoice', () => {
  const row = {
    id: 'inv-1',
    order_id: ORDER_ID,
    payment_id: PAYMENT_ID,
    document_type: 'tax_invoice_receipt' as const,
    status: 'pending' as const,
    idempotency_key: `order:${ORDER_ID}:tax_invoice_receipt`,
    total_agorot: 9_000,
    net_agorot: 7_627,
    vat_agorot: 1_373,
    vat_percent: 18,
    attempts: 0,
  }

  it('writes the document number onto the order, which had no writer before [55]', async () => {
    scriptPaidOrder()
    createDocument.mockResolvedValue({
      success: true,
      documentNumber: 'A-4471',
      documentUrl: 'https://provider.example/doc.pdf',
      failureCode: null,
      failureMessage: null,
      raw: { ok: true },
    })

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: true, documentNumber: 'A-4471' })

    // The terminal that took the money is the terminal that issues the
    // document; the platform account has never heard of another one's deal.
    expect(createDocument.mock.calls[0]?.[1]).toBe('platform')
    const sent = createDocument.mock.calls[0]?.[0] as { totalAgorot: number; transactionId: string }
    expect(sent.totalAgorot).toBe(9_000)
    expect(sent.transactionId).toBe('deal-77')

    const orderUpdate = findAll('orders', 'update').at(-1)?.payload as Record<string, unknown>
    expect(orderUpdate.invoice_number).toBe('A-4471')

    const invoiceUpdate = find('invoices', 'update')?.payload as Record<string, unknown>
    expect(invoiceUpdate.status).toBe('issued')
    expect(invoiceUpdate.document_number).toBe('A-4471')
  })

  it('does not touch the order when the provider rejects it', async () => {
    scriptPaidOrder()
    createDocument.mockResolvedValue({
      success: false,
      documentNumber: null,
      documentUrl: null,
      failureCode: '500',
      failureMessage: 'terminal not configured for documents',
      raw: {},
    })

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: false, dead: false })
    expect(findAll('orders', 'update')).toHaveLength(0)
    const update = find('invoices', 'update')?.payload as Record<string, unknown>
    expect(update.status).toBe('pending')
    expect(update.attempts).toBe(1)
    expect(update.last_error).toContain('terminal not configured')
  })

  it('parks a row as dead on the fifth failure rather than retrying forever', async () => {
    scriptPaidOrder()
    createDocument.mockResolvedValue({
      success: false,
      documentNumber: null,
      documentUrl: null,
      failureCode: '500',
      failureMessage: 'nope',
      raw: {},
    })
    const outcome = await issueInvoice(adminClient as never, { ...row, attempts: 4 })
    expect(outcome).toMatchObject({ ok: false, dead: true })
    expect((find('invoices', 'update')?.payload as Record<string, unknown>).status).toBe('dead')
  })

  it('mails an operator when a document gives up, and only then', async () => {
    // A dead row means money was taken and the receipt it owes does not exist.
    // That is a legal obligation, not a degraded feature, so it must reach a
    // person rather than a log line.
    scriptPaidOrder()
    createDocument.mockResolvedValue({
      success: false,
      documentNumber: null,
      documentUrl: null,
      failureCode: '500',
      failureMessage: 'nope',
      raw: {},
    })

    await issueInvoice(adminClient as never, { ...row, attempts: 1 })
    expect(rpcCalls.filter((call) => call.args.p_kind === 'invoice_dead')).toHaveLength(0)

    rpcCalls.length = 0
    calls.length = 0
    scriptPaidOrder()
    await issueInvoice(adminClient as never, { ...row, attempts: 4 })
    const alert = rpcCalls.find((call) => call.args.p_kind === 'invoice_dead')
    expect(alert).toBeDefined()
    // Deduped on the INVOICE, not the moment: the cron re-finds the same dead
    // row every ten minutes, and a time-based key would mail every ten minutes
    // about one problem.
    expect(alert?.args.p_dedupe).toBe('admin:invoice_dead:inv-1')
    expect((alert?.args.p_payload as Record<string, unknown>).reason).toContain('nope')
  })

  it('records the failure even when the alert cannot be queued', async () => {
    // The alert runs inside `fail`, whose actual job is to set the status and
    // the backoff. An alert that threw would leave the row retrying forever
    // without ever reaching `dead`.
    scriptPaidOrder()
    createDocument.mockResolvedValue({
      success: false,
      documentNumber: null,
      documentUrl: null,
      failureCode: '500',
      failureMessage: 'nope',
      raw: {},
    })
    const broken = {
      ...adminClient,
      rpc: async () => {
        throw new Error('rpc unavailable')
      },
    }
    const outcome = await issueInvoice(broken as never, { ...row, attempts: 4 })
    expect(outcome).toMatchObject({ ok: false, dead: true })
    expect((find('invoices', 'update')?.payload as Record<string, unknown>).status).toBe('dead')
  })

  it('refuses when the rebuilt total disagrees with what was queued', async () => {
    // Nothing on a paid order should move, and if it did, issuing either number
    // would be issuing a document nobody checked.
    scriptPaidOrder({ chargedIls: 80 })
    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: false })
    expect(createDocument).not.toHaveBeenCalled()
    expect((find('invoices', 'update')?.payload as Record<string, unknown>).last_error).toContain(
      'disagrees',
    )
  })

  it('does not spend an attempt when there are no credentials at all', async () => {
    const saved = process.env.NODE_ENV
    vi.stubEnv('NODE_ENV', 'development')
    try {
      const outcome = await issueInvoice(adminClient as never, row)
      expect(outcome).toMatchObject({ ok: false, skipped: true, dead: false })
      // Nothing written: without this, the first cron run after deploy would
      // burn all five attempts of every queued invoice against a missing key
      // and park them dead before anybody set one.
      expect(find('invoices', 'update')).toBeUndefined()
      expect(createDocument).not.toHaveBeenCalled()
    } finally {
      vi.stubEnv('NODE_ENV', saved ?? 'test')
      vi.unstubAllEnvs()
    }
  })
})

describe('backoffMinutes', () => {
  it('spreads five attempts over hours, matching the notification outbox', () => {
    expect([1, 2, 3, 4].map(backoffMinutes)).toEqual([2, 8, 32, 128])
  })
})
