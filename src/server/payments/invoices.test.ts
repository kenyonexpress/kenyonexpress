import { __resetPaymentMoneySchemaCache } from '@/lib/payments/payment-money-columns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The queue between the money path and the provider.
 *
 * Driven through a fake Supabase client, like `refund.test.ts` and for the same
 * reason: the failures worth catching here are shape failures. Which amount the
 * document was built from, whether a replay wrote a second tax document,
 * whether the number on the row is the platform's own and is drawn exactly
 * once, whether the PDF that reached R2 and the mail is a real one, and whether
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
  // Answers come from the same queue mechanism as table calls (key
  // `rpc.<name>`), defaulting to `{ data: null, error: null }`, which is what
  // the fixed mock returned before the sequence RPC needed a scriptable one.
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    return settle(`rpc.${name}`)
  },
}

const createDocument = vi.fn()
vi.mock('@/lib/payments', () => ({
  getPaymentProvider: (accountId?: string | null) => ({
    createDocument: (input: unknown) => createDocument(input, accountId),
  }),
}))
const sendEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (input: unknown) => sendEmail(input),
}))
// The real renderer, spied: the R2 test needs genuine PDF bytes on the wire,
// and the credit-note test needs to see what the renderer was told.
vi.mock('@/lib/invoices/pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invoices/pdf')>()
  return { ...actual, renderInvoicePdf: vi.fn(actual.renderInvoicePdf) }
})
const r2State = vi.hoisted(() => ({ configured: false }))
vi.mock('@/lib/storage/r2', () => ({
  isR2Configured: () => r2State.configured,
  createR2PresignedPutUrl: async (key: string) => ({
    uploadUrl: `https://r2.example/upload/${key}`,
    publicUrl: `https://cdn.example/${key}`,
  }),
  r2PublicUrl: (key: string) => `https://cdn.example/${key}`,
}))

import { renderInvoicePdf } from '@/lib/invoices/pdf'
import {
  backoffMinutes,
  documentIssuingMode,
  enqueueOrderInvoice,
  enqueueRefundCreditNote,
  invoiceIdempotencyKey,
  issueInvoice,
  renderIssuedInvoiceCopy,
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
    // 224: the select names cashback_applied_agorot, which production answers
    // in integer agorot on both schema generations.
    data: {
      id: ORDER_ID,
      user_id: 'user-1',
      cashback_applied_agorot: Math.round((options.walletIls ?? 10) * 100),
    },
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
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ ok: true, id: 'mail-1' })
  vi.mocked(renderInvoicePdf).mockClear()
  r2State.configured = false
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

  const providerIssued = {
    success: true,
    documentNumber: 'A-4471',
    documentUrl: 'https://provider.example/doc.pdf',
    failureCode: null,
    failureMessage: null,
    raw: { ok: true },
  }

  function invoiceUpdates(): Record<string, unknown>[] {
    return findAll('invoices', 'update').map((c) => c.payload as Record<string, unknown>)
  }

  it('issues under the platform’s own number, writes it onto the order, and keeps the provider’s as a reference', async () => {
    scriptPaidOrder()
    queue('rpc.fn_next_invoice_number', { data: 7, error: null })
    createDocument.mockResolvedValue(providerIssued)

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({
      ok: true,
      documentNumber: 'KE-INV-000007',
      documentUrl: null,
      emailed: true,
    })

    // One counter per <terminal>:<type>: each terminal numbers its own books,
    // and a credit note never draws from the sale's series.
    const alloc = rpcCalls.find((call) => call.name === 'fn_next_invoice_number')
    expect(alloc?.args.p_series).toBe('platform:tax_invoice_receipt')

    // The terminal that took the money is the terminal asked for the
    // reference copy, and it is asked NOT to email: the platform sends its own.
    expect(createDocument.mock.calls[0]?.[1]).toBe('platform')
    const sent = createDocument.mock.calls[0]?.[0] as {
      totalAgorot: number
      transactionId: string
      sendByEmail: boolean
    }
    expect(sent.totalAgorot).toBe(9_000)
    expect(sent.transactionId).toBe('deal-77')
    expect(sent.sendByEmail).toBe(false)

    const orderUpdate = findAll('orders', 'update').at(-1)?.payload as Record<string, unknown>
    expect(orderUpdate.invoice_number).toBe('KE-INV-000007')

    // The allocation is its own write, before anything that can still fail.
    const updates = invoiceUpdates()
    expect(updates[0]).toMatchObject({ series: 'platform:tax_invoice_receipt', internal_number: 7 })
    const issued = updates.find((u) => u.status === 'issued') as Record<string, unknown>
    expect(issued.document_number).toBe('KE-INV-000007')
    // No R2 on this machine: no archive URL, and the provider's URL is NOT
    // substituted for it. The account route renders the copy on demand.
    expect(issued.document_url).toBeNull()
    const response = issued.provider_response as {
      platform: { series: string; internal_number: number; storage: string }
      provider: { document_number: string | null; error: string | null }
    }
    expect(response.platform).toMatchObject({
      series: 'platform:tax_invoice_receipt',
      internal_number: 7,
      storage: 'none',
    })
    expect(response.provider).toMatchObject({ document_number: 'A-4471', error: null })
  })

  it('reuses the number already on the row instead of drawing a second one', async () => {
    // A retry after a render or upload failure must not leave a gap in the
    // series: the number drawn on the first attempt is the document's number.
    scriptPaidOrder()
    createDocument.mockResolvedValue(providerIssued)

    const outcome = await issueInvoice(adminClient as never, {
      ...row,
      attempts: 1,
      series: 'platform:tax_invoice_receipt',
      internal_number: 3,
    })
    expect(outcome).toMatchObject({ ok: true, documentNumber: 'KE-INV-000003' })
    expect(rpcCalls.find((call) => call.name === 'fn_next_invoice_number')).toBeUndefined()
    expect(invoiceUpdates()[0]).toMatchObject({
      status: 'issued',
      document_number: 'KE-INV-000003',
    })
  })

  it('fails the attempt, issuing nothing, when the sequence cannot answer', async () => {
    // A tax document without a sequential number is not a document. The row
    // waits for the next run with its attempts counted; nothing is written to
    // the order, nothing is mailed, and the provider is not even asked.
    scriptPaidOrder()
    queue('rpc.fn_next_invoice_number', {
      data: null,
      error: { message: 'function public.fn_next_invoice_number does not exist' },
    })
    createDocument.mockResolvedValue(providerIssued)

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: false, dead: false })
    expect(findAll('orders', 'update')).toHaveLength(0)
    expect(createDocument).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    const update = invoiceUpdates()[0] as Record<string, unknown>
    expect(update.status).toBe('pending')
    expect(update.attempts).toBe(1)
    expect(update.last_error).toContain('sequence_unavailable')
  })

  it('issues without a provider reference when the provider refuses', async () => {
    scriptPaidOrder()
    queue('rpc.fn_next_invoice_number', { data: 8, error: null })
    createDocument.mockResolvedValue({
      success: false,
      documentNumber: null,
      documentUrl: null,
      failureCode: '500',
      failureMessage: 'terminal not configured for documents',
      raw: { declined: true },
    })

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: true, documentNumber: 'KE-INV-000008' })
    const issued = invoiceUpdates().find((u) => u.status === 'issued') as Record<string, unknown>
    const response = issued.provider_response as {
      provider: { document_number: null; error: string }
    }
    expect(response.provider.document_number).toBeNull()
    expect(response.provider.error).toContain('terminal not configured')
    expect(
      (findAll('orders', 'update').at(-1)?.payload as Record<string, unknown>).invoice_number,
    ).toBe('KE-INV-000008')
  })

  it('issues without a provider reference when there are no credentials at all', async () => {
    // Until STEP 42 a missing Cardcom key parked every document. The platform
    // now owes the customer its own PDF whether or not the terminal has a
    // document module to talk to.
    const saved = process.env.NODE_ENV
    vi.stubEnv('NODE_ENV', 'development')
    try {
      scriptPaidOrder()
      queue('rpc.fn_next_invoice_number', { data: 9, error: null })
      const outcome = await issueInvoice(adminClient as never, row)
      expect(outcome).toMatchObject({ ok: true, documentNumber: 'KE-INV-000009' })
      expect(createDocument).not.toHaveBeenCalled()
      const issued = invoiceUpdates().find((u) => u.status === 'issued') as Record<string, unknown>
      expect((issued.provider_response as { provider: { error: string } }).provider.error).toBe(
        'provider_unconfigured',
      )
    } finally {
      vi.stubEnv('NODE_ENV', saved ?? 'test')
      vi.unstubAllEnvs()
    }
  })

  it('archives the PDF in R2 when configured, keyed on the document number', async () => {
    scriptPaidOrder()
    r2State.configured = true
    queue('rpc.fn_next_invoice_number', { data: 42, error: null })
    createDocument.mockResolvedValue(providerIssued)
    const put = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', put)

    try {
      const outcome = await issueInvoice(adminClient as never, row)
      expect(outcome).toMatchObject({
        ok: true,
        documentUrl: `https://cdn.example/invoices/${ORDER_ID}/KE-INV-000042.pdf`,
      })

      // What was PUT is a real PDF, not a placeholder: the render ran end to
      // end through the embedded Hebrew font.
      const [url, init] = put.mock.calls[0] as unknown as [string, { body: Uint8Array }]
      expect(url).toContain(`/invoices/${ORDER_ID}/KE-INV-000042.pdf`)
      expect(new TextDecoder().decode(init.body.slice(0, 5))).toBe('%PDF-')

      const issued = invoiceUpdates().find((u) => u.status === 'issued') as Record<string, unknown>
      expect(issued.document_url).toBe(`https://cdn.example/invoices/${ORDER_ID}/KE-INV-000042.pdf`)
      expect((issued.provider_response as { platform: { storage: string } }).platform.storage).toBe(
        'r2',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('mails the customer the PDF after the row is issued, deduplicated on the invoice', async () => {
    scriptPaidOrder()
    queue('rpc.fn_next_invoice_number', { data: 7, error: null })
    createDocument.mockResolvedValue(providerIssued)
    sendEmail.mockImplementation(async () => {
      calls.push({ table: '__email', op: 'send', chain: [] })
      return { ok: true, id: 'mail-1' }
    })

    await issueInvoice(adminClient as never, row)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const mail = sendEmail.mock.calls[0]?.[0] as {
      to: string
      subject: string
      idempotencyKey: string
      attachments: { filename: string; content: Uint8Array; contentType: string }[]
    }
    expect(mail.to).toBe('dana@example.com')
    expect(mail.subject).toContain('KE-INV-000007')
    expect(mail.idempotencyKey).toBe('invoice:inv-1:issued')
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0]?.filename).toBe('KE-INV-000007.pdf')
    expect(mail.attachments[0]?.contentType).toBe('application/pdf')
    expect(new TextDecoder().decode(mail.attachments[0]?.content.slice(0, 5))).toBe('%PDF-')

    // Issued first, mailed second: a mail about a document whose issued-write
    // then failed would describe a document about to be issued again.
    const issuedAt = calls.findIndex(
      (c) =>
        c.table === 'invoices' &&
        c.op === 'update' &&
        (c.payload as { status?: string }).status === 'issued',
    )
    const mailedAt = calls.findIndex((c) => c.table === '__email')
    expect(issuedAt).toBeGreaterThan(-1)
    expect(mailedAt).toBeGreaterThan(issuedAt)

    // And the send is recorded on the row, in its own tolerant write.
    expect(invoiceUpdates().at(-1)).toMatchObject({ email_error: null })
    expect(typeof invoiceUpdates().at(-1)?.emailed_at).toBe('string')
  })

  it('records a mail refusal on the row without failing the issued document', async () => {
    scriptPaidOrder()
    queue('rpc.fn_next_invoice_number', { data: 7, error: null })
    createDocument.mockResolvedValue(providerIssued)
    sendEmail.mockResolvedValue({ ok: false, reason: 'http_422' })

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: true, emailed: false })
    expect(invoiceUpdates().find((u) => u.status === 'issued')).toBeDefined()
    expect(invoiceUpdates().at(-1)).toEqual({ email_error: 'http_422' })
  })

  it('skips the mail, and says so, when the customer has no address', async () => {
    // Queued before the scripted order so this is the FIRST profile answer.
    queue('profiles.select', { data: { email: null, full_name: 'דנה', phone: '050' }, error: null })
    scriptPaidOrder()
    queue('rpc.fn_next_invoice_number', { data: 7, error: null })
    createDocument.mockResolvedValue(providerIssued)

    const outcome = await issueInvoice(adminClient as never, row)
    expect(outcome).toMatchObject({ ok: true, emailed: false })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('numbers a credit note on its own series and names the invoice it reverses', async () => {
    queue('payments.select', {
      data: { cardcom_transaction_id: 'deal-77', cardcom_account_id: 'platform' },
      error: null,
    })
    queue('orders.select', { data: { user_id: 'user-1' }, error: null })
    queue('profiles.select', {
      data: { email: 'dana@example.com', full_name: 'דנה', phone: '050' },
      error: null,
    })
    queue('invoices.select', { data: { document_number: 'KE-INV-000007' }, error: null })
    queue('rpc.fn_next_invoice_number', { data: 1, error: null })
    createDocument.mockResolvedValue(providerIssued)

    const outcome = await issueInvoice(adminClient as never, {
      ...row,
      id: 'inv-2',
      document_type: 'credit_note',
      payment_id: 'refund-pay-1',
      total_agorot: 4_000,
      net_agorot: 3_390,
      vat_agorot: 610,
    })
    expect(outcome).toMatchObject({ ok: true, documentNumber: 'KE-CRN-000001' })

    const alloc = rpcCalls.find((call) => call.name === 'fn_next_invoice_number')
    expect(alloc?.args.p_series).toBe('platform:credit_note')

    // The sale's number is what the PDF prints as the reversed document.
    const rendered = vi.mocked(renderInvoicePdf).mock.calls[0]?.[0]
    expect(rendered?.relatedDocumentNumber).toBe('KE-INV-000007')
    expect(rendered?.copy).toBe('original')
    expect(rendered?.payment).toEqual({ method: 'card', transactionId: 'deal-77' })

    // A credit note never overwrites the sale's number on the order.
    expect(findAll('orders', 'update')).toHaveLength(0)
  })

  it('parks a row as dead on the fifth failure rather than retrying forever', async () => {
    scriptPaidOrder({ chargedIls: 80 })
    const outcome = await issueInvoice(adminClient as never, { ...row, attempts: 4 })
    expect(outcome).toMatchObject({ ok: false, dead: true })
    expect((find('invoices', 'update')?.payload as Record<string, unknown>).status).toBe('dead')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('mails an operator when a document gives up, and only then', async () => {
    // A dead row means money was taken and the receipt it owes does not exist.
    // That is a legal obligation, not a degraded feature, so it must reach a
    // person rather than a log line.
    scriptPaidOrder({ chargedIls: 80 })
    await issueInvoice(adminClient as never, { ...row, attempts: 1 })
    expect(rpcCalls.filter((call) => call.args.p_kind === 'invoice_dead')).toHaveLength(0)

    rpcCalls.length = 0
    calls.length = 0
    queues.clear()
    __resetPaymentMoneySchemaCache()
    scriptPaidOrder({ chargedIls: 80 })
    await issueInvoice(adminClient as never, { ...row, attempts: 4 })
    const alert = rpcCalls.find((call) => call.args.p_kind === 'invoice_dead')
    expect(alert).toBeDefined()
    // Deduped on the INVOICE, not the moment: the cron re-finds the same dead
    // row every ten minutes, and a time-based key would mail every ten minutes
    // about one problem.
    expect(alert?.args.p_dedupe).toBe('admin:invoice_dead:inv-1')
    expect((alert?.args.p_payload as Record<string, unknown>).reason).toContain('disagrees')
  })

  it('records the failure even when the alert cannot be queued', async () => {
    // The alert runs inside `fail`, whose actual job is to set the status and
    // the backoff. An alert that threw would leave the row retrying forever
    // without ever reaching `dead`.
    scriptPaidOrder({ chargedIls: 80 })
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
    expect(rpcCalls.find((call) => call.name === 'fn_next_invoice_number')).toBeUndefined()
    expect((find('invoices', 'update')?.payload as Record<string, unknown>).last_error).toContain(
      'disagrees',
    )
  })
})

describe('renderIssuedInvoiceCopy', () => {
  it('draws the issued row again, marked as a copy, from its stored number and date', async () => {
    queue('invoices.select', {
      data: {
        id: 'inv-1',
        order_id: ORDER_ID,
        payment_id: PAYMENT_ID,
        document_type: 'tax_invoice_receipt',
        status: 'issued',
        idempotency_key: `order:${ORDER_ID}:tax_invoice_receipt`,
        total_agorot: 9_000,
        net_agorot: 7_627,
        vat_agorot: 1_373,
        vat_percent: 18,
        attempts: 1,
        series: 'platform:tax_invoice_receipt',
        internal_number: 7,
        document_number: 'KE-INV-000007',
        issued_at: '2026-09-10T12:00:00Z',
        provider_response: { provider: { document_number: 'A-4471' } },
      },
      error: null,
    })
    scriptPaidOrder()

    const copy = await renderIssuedInvoiceCopy(adminClient as never, 'inv-1')
    expect(copy?.fileName).toBe('KE-INV-000007.pdf')
    expect(copy?.documentNumber).toBe('KE-INV-000007')
    expect(new TextDecoder().decode(copy?.bytes.slice(0, 5))).toBe('%PDF-')

    const rendered = vi.mocked(renderInvoicePdf).mock.calls[0]?.[0]
    expect(rendered?.copy).toBe('copy')
    expect(rendered?.documentNumber).toBe('KE-INV-000007')
    expect(rendered?.providerDocumentNumber).toBe('A-4471')
    expect(rendered?.issuedAt.toISOString()).toBe('2026-09-10T12:00:00.000Z')
    // Nothing is written: a copy is a read.
    expect(findAll('invoices', 'update')).toHaveLength(0)
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuses a row that is not issued, or whose order no longer matches it', async () => {
    queue('invoices.select', { data: null, error: null })
    expect(await renderIssuedInvoiceCopy(adminClient as never, 'inv-x')).toBeNull()

    calls.length = 0
    queues.clear()
    __resetPaymentMoneySchemaCache()
    queue('invoices.select', {
      data: {
        id: 'inv-1',
        order_id: ORDER_ID,
        payment_id: PAYMENT_ID,
        document_type: 'tax_invoice_receipt',
        status: 'issued',
        total_agorot: 9_000,
        net_agorot: 7_627,
        vat_agorot: 1_373,
        vat_percent: 18,
        attempts: 1,
        document_number: 'KE-INV-000007',
        issued_at: '2026-09-10T12:00:00Z',
        provider_response: null,
      },
      error: null,
    })
    scriptPaidOrder({ chargedIls: 80 })
    expect(await renderIssuedInvoiceCopy(adminClient as never, 'inv-1')).toBeNull()
  })
})

describe('backoffMinutes', () => {
  it('spreads five attempts over hours, matching the notification outbox', () => {
    expect([1, 2, 3, 4].map(backoffMinutes)).toEqual([2, 8, 32, 128])
  })
})
