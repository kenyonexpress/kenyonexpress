import {
  type InvoiceDocument,
  type InvoiceLineInput,
  buildInvoiceDocument,
  buildOrderInvoiceLines,
  resolveVatPercent,
  splitVatInclusive,
} from '@/lib/invoices/document'
import { log } from '@/lib/observability/log'
import { getPaymentProvider } from '@/lib/payments'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The tax document for a sale, and the credit note for a refund.
 *
 * SHAPE: A QUEUE, NOT A CALL
 *
 * `finalizeOrder` runs after the card has been charged. Everything it does
 * after that point is written so it cannot unwind a payment that succeeded -
 * the settlement journal and the voucher email are both explicitly incapable of
 * throwing - and a tax document is a network call to a third party, which is
 * the least reliable thing on that list.
 *
 * But unlike an email, a missing invoice is not something to shrug at, so it is
 * not merely swallowed: enqueueing writes a row, the row is attempted
 * immediately, and a failure leaves the row `pending` with the reason on it for
 * `/api/cron/invoices` to retry. Five failures park it as `dead`, which is a
 * state an admin can see. This is the `notification_outbox` pattern (095), for
 * the same reason it was chosen there: durability comes from the row, not from
 * the transport.
 *
 * WHAT THE DOCUMENT IS FOR, WHICH DECIDES ITS TOTAL
 *
 * It is the customer's receipt for money that moved, so its total is the amount
 * on the `payments` row - what Cardcom actually took - and not the order's
 * `total`, which is `paidOnSite` BEFORE wallet credit and any platform-funded
 * discount are taken off it (`calculateSettlement`: `cardCharge = paidOnSite -
 * walletApplied - discountApplied`). A receipt that does not match the card
 * statement is a document that has to be explained.
 *
 * The discount is therefore taken as the residual - what is left of the lines
 * after the wallet credit and the charge - rather than read from a column.
 * `orders` carries `discount_ils`/`discount_agorot` depending on generation and
 * naming the wrong one fails the whole select with 42703; the residual is exact
 * by construction and needs no probe. If the residual comes out negative the
 * lines do not describe the charge, and `buildInvoiceDocument` refuses.
 *
 * WALLET-ONLY ORDERS GET NO DOCUMENT, ON PURPOSE
 *
 * An order covered entirely by wallet credit has no `payments` row and no
 * Cardcom deal, so there is nothing for the provider's document module to
 * attach to and no money it moved. Enqueueing one would mean asking Cardcom to
 * issue a receipt for a transaction it never saw. The skip is logged with a
 * reason rather than left as an absence.
 */

type AdminClient = SupabaseClient

export type InvoiceDocumentType = 'tax_invoice_receipt' | 'credit_note'

export interface InvoiceRow {
  id: string
  order_id: string
  payment_id: string | null
  document_type: InvoiceDocumentType
  status: 'pending' | 'issued' | 'failed' | 'dead'
  idempotency_key: string
  total_agorot: number
  net_agorot: number
  vat_agorot: number
  vat_percent: number
  attempts: number
}

/** Attempts before a row is parked as dead rather than retried forever. */
export const MAX_ATTEMPTS = 5

/** 2, 8, 32, 128 minutes, matching the notification outbox. */
export function backoffMinutes(attempts: number): number {
  return 2 * 4 ** Math.max(0, attempts - 1)
}

/** Postgres: undefined_table, i.e. 107 has not been applied to this database. */
const UNDEFINED_TABLE = '42P01'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === UNDEFINED_TABLE ||
    /relation .*invoices.* does not exist/i.test(error.message ?? '')
  )
}

export function invoiceIdempotencyKey(
  documentType: InvoiceDocumentType,
  ids: { orderId: string; paymentId?: string | null },
): string {
  // A sale has exactly one receipt per ORDER, and finalize is replay-safe, so
  // the order id is the right key there. A refund can happen more than once on
  // one order (partial refunds), and each one is its own credit note, so that
  // side keys on the refund payment.
  return documentType === 'credit_note'
    ? `payment:${ids.paymentId}:credit_note`
    : `order:${ids.orderId}:tax_invoice_receipt`
}

// ---------------------------------------------------------------------------
// Reading the order
// ---------------------------------------------------------------------------

interface OrderInvoiceContext {
  orderId: string
  paymentId: string | null
  chargedAgorot: number
  lines: InvoiceLineInput[]
  customer: { name: string | null; email: string | null; phone: string | null }
  transactionId: string | null
  /**
   * The terminal the money moved on. A document has to be issued on the same
   * account that took the payment, for the reason `getPaymentProvider` already
   * documents about tokens and Low Profile ids: Cardcom scopes artefacts to the
   * terminal that created them, and the platform terminal has never heard of a
   * deal that belongs to another one.
   */
  cardcomAccountId: string | null
}

async function loadOrderContext(
  admin: AdminClient,
  orderId: string,
  paymentId: string | null,
): Promise<{ context: OrderInvoiceContext } | { skip: string }> {
  if (!paymentId) return { skip: 'no_payment' }

  const money = await resolvePaymentMoneySchema((column) =>
    admin
      .from('payments')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error })),
  )

  const { data: paymentRow } = await admin
    .from('payments')
    .select(`id, status, cardcom_transaction_id, cardcom_account_id, ${money.amountColumn}`)
    .eq('id', paymentId)
    .maybeSingle()
  const payment = paymentRow as unknown as
    | (Record<string, unknown> & {
        id: string
        status: string
        cardcom_transaction_id: string | null
        cardcom_account_id: string | null
      })
    | null
  if (!payment) return { skip: 'payment_not_found' }

  const chargedAgorot = readAmountAgorot(money, payment) ?? 0
  if (chargedAgorot <= 0) return { skip: 'nothing_charged' }

  const { data: orderRow } = await admin
    .from('orders')
    .select('id, user_id, cashback_applied_ils, cashback_applied_agorot')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as unknown as {
    id: string
    user_id: string
    cashback_applied_ils?: number | string | null
    cashback_applied_agorot?: number | null
  } | null
  if (!order) return { skip: 'order_not_found' }

  // Both spellings are selected together rather than probed: this select is
  // tolerant because PostgREST returns the columns it has, and the wallet
  // amount is the one number here that is not worth a round trip to resolve.
  const walletAppliedAgorot =
    order.cashback_applied_agorot != null
      ? Math.round(Number(order.cashback_applied_agorot))
      : Math.round(Number(order.cashback_applied_ils ?? 0) * 100)

  const { data: itemRows } = await admin
    .from('order_items')
    .select('product_id, product_type, quantity, paid_on_site_agorot, balance_due_agorot')
    .eq('order_id', orderId)
  const items = (itemRows ?? []) as unknown as {
    product_id: string | null
    product_type: string
    quantity: number
    paid_on_site_agorot: number | null
    balance_due_agorot: number | null
  }[]
  if (items.length === 0) return { skip: 'order_has_no_items' }

  const productIds = [...new Set(items.map((i) => i.product_id).filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: products } = await admin
      .from('products')
      .select('id, name_he')
      .in('id', productIds)
    for (const p of (products ?? []) as { id: string; name_he: string | null }[]) {
      if (p.name_he) names.set(p.id, p.name_he)
    }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name, phone')
    .eq('id', order.user_id)
    .maybeSingle()
  const customerRow = profile as {
    email: string | null
    full_name: string | null
    phone: string | null
  } | null

  const itemLines = items.map((item) => ({
    productName: item.product_id ? (names.get(item.product_id) ?? null) : null,
    productType: item.product_type,
    quantity: item.quantity,
    paidOnSiteAgorot: item.paid_on_site_agorot ?? 0,
    balanceDueAgorot: item.balance_due_agorot ?? 0,
  }))

  const paidOnSiteTotal = itemLines.reduce((sum, l) => sum + l.paidOnSiteAgorot, 0)
  // The residual. See the header: `discount` is what is left of the lines once
  // the wallet credit and the actual charge are taken off them.
  const discountAgorot = paidOnSiteTotal - walletAppliedAgorot - chargedAgorot

  return {
    context: {
      orderId,
      paymentId,
      chargedAgorot,
      lines: buildOrderInvoiceLines({
        lines: itemLines,
        walletAppliedAgorot,
        discountAgorot,
      }),
      customer: {
        name: customerRow?.full_name ?? null,
        email: customerRow?.email ?? null,
        phone: customerRow?.phone ?? null,
      },
      transactionId: payment.cardcom_transaction_id,
      cardcomAccountId: payment.cardcom_account_id,
    },
  }
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export type EnqueueResult =
  | { enqueued: true; invoiceId: string; replay: boolean }
  | { enqueued: false; reason: string }

async function insertInvoice(
  admin: AdminClient,
  row: {
    order_id: string
    payment_id: string | null
    document_type: InvoiceDocumentType
    idempotency_key: string
    total_agorot: number
    net_agorot: number
    vat_agorot: number
    vat_percent: number
  },
): Promise<EnqueueResult> {
  const { data, error } = await admin
    .from('invoices')
    .insert(row as never)
    .select('id')
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) {
      // A deployment against a database without 107 keeps working with no
      // documents, exactly as it did before this feature existed.
      log.warn('invoices.table_missing', { orderId: row.order_id })
      return { enqueued: false, reason: 'table_missing' }
    }
    // Unique violation on the idempotency key IS the replay guard, and a replay
    // is a success with nothing to do.
    if (error.code === '23505') {
      const { data: existing } = await admin
        .from('invoices')
        .select('id')
        .eq('idempotency_key', row.idempotency_key)
        .maybeSingle()
      const id = (existing as { id: string } | null)?.id
      return id
        ? { enqueued: true, invoiceId: id, replay: true }
        : { enqueued: false, reason: 'duplicate' }
    }
    log.error('invoices.enqueue_failed', { orderId: row.order_id, reason: error.message })
    return { enqueued: false, reason: error.message }
  }

  const id = (data as { id: string } | null)?.id
  if (!id) return { enqueued: false, reason: 'insert_returned_no_row' }
  return { enqueued: true, invoiceId: id, replay: false }
}

/**
 * Queues the tax invoice/receipt for a paid order. Never throws: the caller is
 * `finalizeOrder`, past the point where the card has been charged.
 */
export async function enqueueOrderInvoice(
  admin: AdminClient,
  input: { orderId: string; paymentId: string | null },
): Promise<EnqueueResult> {
  try {
    const loaded = await loadOrderContext(admin, input.orderId, input.paymentId)
    if ('skip' in loaded) {
      log.info('invoices.skipped', { orderId: input.orderId, reason: loaded.skip })
      return { enqueued: false, reason: loaded.skip }
    }

    const vatPercent = resolveVatPercent()
    // Built here as well as at issue time, so a document that cannot be built
    // is rejected before a row exists rather than failing five times in a cron.
    const document = buildInvoiceDocument({
      documentType: 'tax_invoice_receipt',
      customer: loaded.context.customer,
      lines: loaded.context.lines,
      chargedAgorot: loaded.context.chargedAgorot,
      vatPercent,
      reference: input.orderId,
    })

    return await insertInvoice(admin, {
      order_id: input.orderId,
      payment_id: input.paymentId,
      document_type: 'tax_invoice_receipt',
      idempotency_key: invoiceIdempotencyKey('tax_invoice_receipt', { orderId: input.orderId }),
      total_agorot: document.totalAgorot,
      net_agorot: document.netAgorot,
      vat_agorot: document.vatAgorot,
      vat_percent: document.vatPercent,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'enqueue failed'
    log.error('invoices.enqueue_threw', { orderId: input.orderId, reason })
    return { enqueued: false, reason }
  }
}

/**
 * Queues the credit note for a refund that has already gone through.
 *
 * The amount is the refunded amount, not the order's, because a partial refund
 * is a partial credit note. It is passed in rather than re-read: the refund
 * action holds the number Cardcom confirmed, and re-deriving it here could
 * disagree with the money that actually moved.
 */
export async function enqueueRefundCreditNote(
  admin: AdminClient,
  input: { orderId: string; refundPaymentId: string; refundedAgorot: number; reason: string },
): Promise<EnqueueResult> {
  try {
    if (!Number.isSafeInteger(input.refundedAgorot) || input.refundedAgorot <= 0) {
      return { enqueued: false, reason: 'nothing_refunded' }
    }
    const vatPercent = resolveVatPercent()
    const { netAgorot, vatAgorot } = splitVatInclusive(input.refundedAgorot, vatPercent)

    return await insertInvoice(admin, {
      order_id: input.orderId,
      payment_id: input.refundPaymentId,
      document_type: 'credit_note',
      idempotency_key: invoiceIdempotencyKey('credit_note', {
        orderId: input.orderId,
        paymentId: input.refundPaymentId,
      }),
      total_agorot: input.refundedAgorot,
      net_agorot: netAgorot,
      vat_agorot: vatAgorot,
      vat_percent: vatPercent,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'enqueue failed'
    log.error('invoices.credit_note_enqueue_threw', { orderId: input.orderId, reason })
    return { enqueued: false, reason }
  }
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

async function buildDocumentForRow(
  admin: AdminClient,
  row: InvoiceRow,
): Promise<
  | { document: InvoiceDocument; transactionId: string | null; cardcomAccountId: string | null }
  | { error: string }
> {
  if (row.document_type === 'credit_note') {
    const deal = await loadPaymentDeal(admin, row.payment_id)
    return {
      document: buildInvoiceDocument({
        documentType: 'credit_note',
        customer: await loadCustomerForOrder(admin, row.order_id),
        lines: [
          {
            description: `זיכוי בגין הזמנה ${row.order_id.slice(0, 8)}`,
            quantity: 1,
            totalAgorot: row.total_agorot,
          },
        ],
        chargedAgorot: row.total_agorot,
        vatPercent: Number(row.vat_percent),
        reference: row.order_id,
      }),
      transactionId: deal.transactionId,
      cardcomAccountId: deal.cardcomAccountId,
    }
  }

  const loaded = await loadOrderContext(admin, row.order_id, row.payment_id)
  if ('skip' in loaded) return { error: loaded.skip }

  const document = buildInvoiceDocument({
    documentType: 'tax_invoice_receipt',
    customer: loaded.context.customer,
    lines: loaded.context.lines,
    chargedAgorot: loaded.context.chargedAgorot,
    vatPercent: Number(row.vat_percent),
    reference: row.order_id,
  })

  // The row was written from the same computation at enqueue time. If they
  // disagree, something about the order changed after it was paid, and issuing
  // either number would be issuing a document nobody checked.
  if (document.totalAgorot !== row.total_agorot) {
    return {
      error: `document total ${document.totalAgorot} disagrees with the queued ${row.total_agorot}`,
    }
  }

  return {
    document,
    transactionId: loaded.context.transactionId,
    cardcomAccountId: loaded.context.cardcomAccountId,
  }
}

async function loadCustomerForOrder(
  admin: AdminClient,
  orderId: string,
): Promise<{ name: string | null; email: string | null; phone: string | null }> {
  const { data: order } = await admin
    .from('orders')
    .select('user_id')
    .eq('id', orderId)
    .maybeSingle()
  const userId = (order as { user_id: string } | null)?.user_id
  if (!userId) return { name: null, email: null, phone: null }
  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name, phone')
    .eq('id', userId)
    .maybeSingle()
  const row = profile as {
    email: string | null
    full_name: string | null
    phone: string | null
  } | null
  return { name: row?.full_name ?? null, email: row?.email ?? null, phone: row?.phone ?? null }
}

async function loadPaymentDeal(
  admin: AdminClient,
  paymentId: string | null,
): Promise<{ transactionId: string | null; cardcomAccountId: string | null }> {
  if (!paymentId) return { transactionId: null, cardcomAccountId: null }
  const { data } = await admin
    .from('payments')
    .select('cardcom_transaction_id, cardcom_account_id')
    .eq('id', paymentId)
    .maybeSingle()
  const row = data as {
    cardcom_transaction_id: string | null
    cardcom_account_id: string | null
  } | null
  return {
    transactionId: row?.cardcom_transaction_id ?? null,
    cardcomAccountId: row?.cardcom_account_id ?? null,
  }
}

/**
 * Mirrors the provider's PDF into R2, so the link on the customer's order page
 * keeps working when the provider's own link does not.
 *
 * Best effort by design: the document has been issued and its number is the
 * fact that matters. A copy that could not be made is logged and the provider's
 * URL is kept, which is strictly better than failing an issued document.
 */
async function mirrorPdf(documentUrl: string, key: string): Promise<string | null> {
  try {
    // Imported here rather than at the top of the file: `lib/storage/r2` is
    // `server-only`, and this module is reached from the refund action's tests
    // through `refund.ts`. A static import makes those test files fail to
    // resolve before a single assertion runs.
    const { createR2PresignedPutUrl, isR2Configured, r2PublicUrl } = await import(
      '@/lib/storage/r2'
    )
    if (!isR2Configured()) return null
    const source = await fetch(documentUrl)
    if (!source.ok) return null
    const body = await source.arrayBuffer()
    const { uploadUrl, publicUrl } = await createR2PresignedPutUrl(key)
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body,
    })
    if (!put.ok) {
      log.warn('invoices.mirror_failed', { key, status: put.status })
      return null
    }
    return publicUrl || r2PublicUrl(key)
  } catch (error) {
    log.warn('invoices.mirror_threw', {
      key,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

export type IssueOutcome =
  | { ok: true; documentNumber: string; documentUrl: string | null }
  | { ok: false; reason: string; dead: boolean; skipped?: false }
  | { ok: false; reason: string; dead: false; skipped: true }

/**
 * Whether a document may be requested at all, and from what.
 *
 * TWO FAILURES THIS PREVENTS, BOTH OF THEM QUIET.
 *
 * (1) No credentials is not a failure OF THE ROW. Cardcom keys are a listed
 * GO/NO-GO item and are not on this machine; without this check the first cron
 * run after deploy would burn all five attempts of every queued invoice against
 * a `Missing required env` throw and park them `dead` before anybody set a key.
 * The notification outbox already draws this distinction (`result.skipped`) and
 * for the same reason.
 *
 * (2) The mock must never write a document number to a real order. `useMock` is
 * true whenever `CARDCOM_TERMINAL_NUMBER` is absent outside production, which
 * is the normal state of a developer's machine - and this project runs against
 * the hosted database, so a mock run there would stamp `mock-doc-3` onto a real
 * order as its INVOICE NUMBER. The mock is therefore only accepted when it was
 * asked for explicitly.
 */
export function documentIssuingMode(
  env: NodeJS.ProcessEnv = process.env,
): 'ready' | 'mock' | 'unconfigured' {
  if (env.NODE_ENV === 'test' || env.CARDCOM_USE_MOCK === 'true') return 'mock'
  return env.CARDCOM_TERMINAL_NUMBER && env.CARDCOM_API_NAME ? 'ready' : 'unconfigured'
}

/**
 * Sends one queued document to the provider and records what came back.
 *
 * `orders.invoice_number` is written here and only here. Until [55] that column
 * had four readers and no writer, which is why searching the admin order list
 * by invoice number could not return a row.
 */
export async function issueInvoice(
  admin: AdminClient,
  row: InvoiceRow,
  now: Date = new Date(),
): Promise<IssueOutcome> {
  const mode = documentIssuingMode()
  if (mode === 'unconfigured') {
    // Not counted as an attempt, and nothing is written. See
    // `documentIssuingMode`: the row is owed a document, the machine simply
    // cannot ask for one yet, and the moment the keys are set the next cron run
    // issues it with all five attempts still in hand.
    log.info('invoices.provider_unconfigured', { invoiceId: row.id, orderId: row.order_id })
    return { ok: false, reason: 'provider_unconfigured', dead: false, skipped: true }
  }

  const attempts = row.attempts + 1

  const fail = async (reason: string): Promise<IssueOutcome> => {
    const dead = attempts >= MAX_ATTEMPTS
    const next = new Date(now.getTime() + backoffMinutes(attempts) * 60_000)
    await admin
      .from('invoices')
      .update({
        status: dead ? 'dead' : 'pending',
        attempts,
        last_error: reason.slice(0, 500),
        next_attempt_at: next.toISOString(),
      } as never)
      .eq('id', row.id)
    log[dead ? 'error' : 'warn']('invoices.issue_failed', {
      invoiceId: row.id,
      orderId: row.order_id,
      attempts,
      dead,
      reason,
    })
    return { ok: false, reason, dead }
  }

  let built: Awaited<ReturnType<typeof buildDocumentForRow>>
  try {
    built = await buildDocumentForRow(admin, row)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'build failed')
  }
  if ('error' in built) return fail(built.error)

  const { document, transactionId, cardcomAccountId } = built

  let result: Awaited<ReturnType<ReturnType<typeof getPaymentProvider>['createDocument']>>
  try {
    result = await getPaymentProvider(cardcomAccountId).createDocument({
      documentType: document.documentType,
      customerName: document.customer.name,
      customerEmail: document.customer.email,
      customerPhone: document.customer.phone,
      lines: document.lines,
      totalAgorot: document.totalAgorot,
      vatPercent: document.vatPercent,
      transactionId,
      reference: document.reference,
      sendByEmail: true,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'provider call failed')
  }

  if (!result.success || !result.documentNumber) {
    return fail(result.failureMessage ?? `provider rejected (${result.failureCode ?? 'unknown'})`)
  }

  const mirrored = result.documentUrl
    ? await mirrorPdf(
        result.documentUrl,
        `invoices/${row.order_id}/${result.documentNumber.replace(/[^\w.-]/g, '_')}.pdf`,
      )
    : null

  await admin
    .from('invoices')
    .update({
      status: 'issued',
      attempts,
      document_number: result.documentNumber,
      document_url: mirrored ?? result.documentUrl,
      issued_at: now.toISOString(),
      provider_response: result.raw as never,
      last_error: null,
    } as never)
    .eq('id', row.id)

  if (row.document_type === 'tax_invoice_receipt') {
    // Only the sale's own document names the order. A credit note has its own
    // number and must not overwrite the invoice number of the sale it reverses.
    await admin
      .from('orders')
      .update({ invoice_number: result.documentNumber } as never)
      .eq('id', row.order_id)
  }

  log.info('invoices.issued', {
    invoiceId: row.id,
    orderId: row.order_id,
    documentNumber: result.documentNumber,
    mirrored: mirrored != null,
  })

  return {
    ok: true,
    documentNumber: result.documentNumber,
    documentUrl: mirrored ?? result.documentUrl,
  }
}

/** Rows the queue owes work on, oldest deadline first. */
export async function loadDueInvoices(
  admin: AdminClient,
  limit: number,
  now: Date = new Date(),
): Promise<InvoiceRow[]> {
  const { data, error } = await admin
    .from('invoices')
    .select(
      'id, order_id, payment_id, document_type, status, idempotency_key, total_agorot, net_agorot, vat_agorot, vat_percent, attempts',
    )
    .eq('status', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(limit)

  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as unknown as InvoiceRow[]
}

/**
 * Issues one queued document immediately, right after it was enqueued.
 *
 * The cron is the safety net, not the mechanism: a customer who has just paid
 * should be able to see their invoice on the order page, not in five minutes.
 * Incapable of throwing, for the same reason `enqueueOrderInvoice` is.
 */
export async function issueQueuedInvoice(admin: AdminClient, invoiceId: string): Promise<void> {
  try {
    const { data } = await admin
      .from('invoices')
      .select(
        'id, order_id, payment_id, document_type, status, idempotency_key, total_agorot, net_agorot, vat_agorot, vat_percent, attempts',
      )
      .eq('id', invoiceId)
      .eq('status', 'pending')
      .maybeSingle()
    const row = data as unknown as InvoiceRow | null
    if (!row) return
    await issueInvoice(admin, row)
  } catch (error) {
    log.warn('invoices.immediate_issue_threw', {
      invoiceId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/** The issued document for an order, if there is one. */
export async function getOrderInvoice(
  admin: AdminClient,
  orderId: string,
): Promise<{
  documentNumber: string | null
  documentUrl: string | null
  issuedAt: string | null
} | null> {
  const { data, error } = await admin
    .from('invoices')
    .select('document_number, document_url, issued_at')
    .eq('order_id', orderId)
    .eq('document_type', 'tax_invoice_receipt')
    .eq('status', 'issued')
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as {
    document_number: string | null
    document_url: string | null
    issued_at: string | null
  }
  return {
    documentNumber: row.document_number,
    documentUrl: row.document_url,
    issuedAt: row.issued_at,
  }
}
