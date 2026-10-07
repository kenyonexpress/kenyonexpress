import { orderCashbackSelect, readOrderCashbackAgorot } from '@/lib/commerce/order-money-columns'
import { adminAlertDedupeKey, adminAlertRecipient } from '@/lib/email/admin-alerts'
import { buildInvoiceEmail } from '@/lib/email/invoice-email'
import { sendEmail } from '@/lib/email/resend'
import {
  type InvoiceDocument,
  type InvoiceDocumentType,
  type InvoiceLineInput,
  buildInvoiceDocument,
  buildOrderInvoiceLines,
  documentTypeForOrder,
  resolveVatPercent,
  splitVatInclusive,
} from '@/lib/invoices/document'
import { formatInvoiceNumber, invoiceSeries, resolveInvoiceIssuer } from '@/lib/invoices/issuer'
import { invoicePdfFileName, renderInvoicePdf } from '@/lib/invoices/pdf'
import { log } from '@/lib/observability/log'
import { getPaymentProvider } from '@/lib/payments'
import { readAmountAgorot, resolvePaymentMoneySchema } from '@/lib/payments/payment-money-columns'
import { siteUrl } from '@/lib/site-url'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The tax document for a sale, and the credit note for a refund.
 *
 * WHO ISSUES IT (STEP 42). The platform does. Each row is numbered from the
 * platform's own per-terminal sequence (228), rendered as a Hebrew PDF by
 * `lib/invoices/pdf.ts`, archived in R2 when R2 exists, recorded with OUR
 * number in `document_number`, and mailed to the customer with the PDF
 * attached. The payment provider's document module, whose wire format has
 * never been confirmed against a live terminal, is asked for a reference copy
 * and nothing more: its number lands in `provider_response`, never in
 * `document_number`, and its absence or refusal does not hold the queue.
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

/**
 * Re-exported rather than re-declared. A second literal union here would drift
 * from the builder's the first time one of them gained a member - which is
 * exactly what happened when `coupon_receipt` was added in 116.
 */
export type { InvoiceDocumentType }

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
  /** 228's allocation, present once a number was drawn for this row. */
  series?: string | null
  internal_number?: number | null
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
  //
  // The sale's key deliberately does NOT name which of the two sale documents
  // it is. An order owes exactly ONE, and keying on the type would let a
  // reclassification queue a second document for the same money.
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
  /**
   * What the order actually contained, so the DOCUMENT TYPE is decided from the
   * order rather than assumed. Carried through the context instead of re-read
   * at enqueue time: two reads of `order_items` could disagree, and the one
   * that decides the tax document must be the one the lines were built from.
   */
  productTypes: string[]
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

  // No probe since 224: `cashback_applied_agorot` exists on both schema
  // generations (writable post-059, a GENERATED agorot twin of
  // `cashback_applied_ils` on the hosted pre-059 project), so the one name is
  // safe to select and always answers in integer agorot.
  const { data: orderRow } = await admin
    .from('orders')
    .select(`id, user_id, ${orderCashbackSelect()}`)
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as unknown as
    | (Record<string, unknown> & {
        id: string
        user_id: string
      })
    | null
  if (!order) return { skip: 'order_not_found' }

  const walletAppliedAgorot = readOrderCashbackAgorot(order)

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
    // No deleted_at filter, on purpose: this names lines on a tax document for
    // an order that already happened. See src/lib/soft-delete.ts.
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
      productTypes: items.map((item) => item.product_type),
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
    // Decided from what the order CONTAINS, not assumed. A coupon-only order is
    // an advance and gets a receipt at VAT 0; anything with a physical line is
    // a taxable sale and gets the tax invoice. See `documentTypeForOrder`.
    const documentType = documentTypeForOrder(loaded.context.productTypes)

    // Built here as well as at issue time, so a document that cannot be built
    // is rejected before a row exists rather than failing five times in a cron.
    const document = buildInvoiceDocument({
      documentType,
      customer: loaded.context.customer,
      lines: loaded.context.lines,
      chargedAgorot: loaded.context.chargedAgorot,
      vatPercent,
      reference: input.orderId,
    })

    return await insertInvoice(admin, {
      order_id: input.orderId,
      payment_id: input.paymentId,
      document_type: documentType,
      idempotency_key: invoiceIdempotencyKey(documentType, { orderId: input.orderId }),
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

interface BuiltRow {
  document: InvoiceDocument
  transactionId: string | null
  cardcomAccountId: string | null
  /** On a credit note: the sale document it reverses, when one was issued. */
  relatedDocumentNumber: string | null
}

async function buildDocumentForRow(
  admin: AdminClient,
  row: InvoiceRow,
): Promise<BuiltRow | { error: string }> {
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
      relatedDocumentNumber: await loadSaleDocumentNumber(admin, row.order_id),
    }
  }

  const loaded = await loadOrderContext(admin, row.order_id, row.payment_id)
  if ('skip' in loaded) return { error: loaded.skip }

  const document = buildInvoiceDocument({
    documentType: row.document_type,
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
    relatedDocumentNumber: null,
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
 * The number of the sale's own document, for a credit note to name. A credit
 * note that does not say which invoice it reverses is a document a reader
 * has to reconcile by amount, and two refunds of equal size make that
 * impossible.
 */
async function loadSaleDocumentNumber(admin: AdminClient, orderId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('invoices')
    .select('document_number')
    .eq('order_id', orderId)
    .neq('document_type', 'credit_note')
    .eq('status', 'issued')
    .maybeSingle()
  if (error) {
    // The credit note is still issued; it just cannot name what it reverses,
    // and the PDF says so in words rather than printing a blank.
    log.warn('invoices.sale_document_read_failed', { orderId, reason: error.message })
    return null
  }
  return (data as { document_number: string | null } | null)?.document_number ?? null
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

export interface InvoiceNumberAllocation {
  series: string
  internalNumber: number
  /** The printed form, e.g. `KE-INV-000042`. */
  formatted: string
}

/**
 * The document's sequential number, from `fn_next_invoice_number` (228,
 * measured live in production on 2026-10-08): one counter per
 * `<terminal>:<type>` series, bumped atomically, so each terminal numbers its
 * own books.
 *
 * REQUIRED, NOT BEST EFFORT. Until STEP 42 this was optional because the
 * provider's number was the document's and this one only decorated a
 * supplementary PDF. Now the platform's PDF IS the document, and an Israeli
 * tax document without a sequential number is not a document, so a row that
 * cannot be numbered is a row that retries rather than one that issues.
 *
 * GAPLESS UNDER RETRY. The allocation is written to the row in its own
 * UPDATE the moment it is made, and a row that already carries one reuses it
 * instead of drawing again. A render or upload that fails after the number
 * was drawn therefore costs a retry, not a gap in the series - and a gap that
 * corresponds to no document is the thing an auditor asks about.
 */
async function ensureInvoiceNumber(
  admin: AdminClient,
  row: InvoiceRow,
  cardcomAccountId: string | null,
): Promise<InvoiceNumberAllocation | { error: string }> {
  if (row.series && row.internal_number != null && Number.isSafeInteger(row.internal_number)) {
    // The series string names the terminal it was allocated on; the row, not
    // today's payment read, is the authority on which books it belongs to.
    const account = row.series.split(':')[0] || null
    return {
      series: row.series,
      internalNumber: row.internal_number,
      formatted: formatInvoiceNumber(account, row.document_type, row.internal_number),
    }
  }

  const series = invoiceSeries(cardcomAccountId, row.document_type)
  let data: unknown
  try {
    const result = await admin.rpc('fn_next_invoice_number', { p_series: series })
    if (result.error) return { error: `sequence_unavailable: ${result.error.message}` }
    data = result.data
  } catch (error) {
    return { error: `sequence_threw: ${error instanceof Error ? error.message : 'unknown'}` }
  }
  const internalNumber = typeof data === 'number' ? data : Number(data)
  if (!Number.isSafeInteger(internalNumber) || internalNumber < 1) {
    return { error: `sequence_returned_nonsense: ${String(data)}` }
  }

  const { error: writeError } = await admin
    .from('invoices')
    .update({ series, internal_number: internalNumber } as never)
    .eq('id', row.id)
  if (writeError) {
    // The number is drawn and cannot be un-drawn; recording it is what keeps
    // the retry from drawing another. A failure here is logged with the
    // number so the gap it will leave can be explained.
    log.error('invoices.internal_number_write_failed', {
      invoiceId: row.id,
      series,
      internalNumber,
      reason: writeError.message,
    })
    return { error: `allocation_write_failed: ${writeError.message}` }
  }

  return {
    series,
    internalNumber,
    formatted: formatInvoiceNumber(cardcomAccountId, row.document_type, internalNumber),
  }
}

// ---------------------------------------------------------------------------
// Provider reference, archive, email
// ---------------------------------------------------------------------------

/**
 * Whether the provider's document module can be asked for a reference
 * document, and from what.
 *
 * SINCE STEP 42 THIS DECIDES THE REFERENCE, NOT THE DOCUMENT. The platform
 * issues its own numbered PDF whatever this answers; `unconfigured` means the
 * document goes out without a clearing-side twin, and the moment the keys
 * land the next sale gets one. Nothing is parked waiting for a credential.
 *
 * The mock must never stamp a number onto a real order as the document's own.
 * `useMock` is true whenever `CARDCOM_TERMINAL_NUMBER` is absent outside
 * production, which is the normal state of a developer's machine against the
 * hosted database. The mock's `mock-doc-N` is therefore only ever recorded
 * inside `provider_response`, never in `document_number`, and is only asked
 * for at all when it was asked for explicitly.
 */
export function documentIssuingMode(
  env: NodeJS.ProcessEnv = process.env,
): 'ready' | 'mock' | 'unconfigured' {
  if (env.NODE_ENV === 'test' || env.CARDCOM_USE_MOCK === 'true') return 'mock'
  return env.CARDCOM_TERMINAL_NUMBER && env.CARDCOM_API_NAME ? 'ready' : 'unconfigured'
}

interface ProviderReference {
  documentNumber: string | null
  documentUrl: string | null
  raw: Record<string, unknown> | null
  error: string | null
}

/**
 * Asks the terminal for its own copy of the document, as a reference.
 *
 * Best effort by policy: the provider's wire format for documents has never
 * been confirmed against a live terminal (the legacy `/Interface/*.aspx`
 * client, no `CARDCOM_*` on any machine that ran this), and a customer's
 * invoice must not depend on it. A refusal is recorded on the row inside
 * `provider_response` and logged; it is not an attempt against the queue.
 * The provider is asked NOT to email: the platform sends its own document.
 */
async function requestProviderReference(
  built: BuiltRow,
  row: InvoiceRow,
): Promise<ProviderReference> {
  if (documentIssuingMode() === 'unconfigured') {
    return { documentNumber: null, documentUrl: null, raw: null, error: 'provider_unconfigured' }
  }
  const { document } = built
  try {
    const result = await getPaymentProvider(built.cardcomAccountId).createDocument({
      documentType: document.documentType,
      customerName: document.customer.name,
      customerEmail: document.customer.email,
      customerPhone: document.customer.phone,
      lines: document.lines,
      totalAgorot: document.totalAgorot,
      vatPercent: document.vatPercent,
      transactionId: built.transactionId,
      reference: document.reference,
      sendByEmail: false,
    })
    if (!result.success || !result.documentNumber) {
      const error =
        result.failureMessage ?? `provider rejected (${result.failureCode ?? 'unknown'})`
      log.warn('invoices.provider_reference_refused', { invoiceId: row.id, reason: error })
      return { documentNumber: null, documentUrl: null, raw: result.raw, error }
    }
    return {
      documentNumber: result.documentNumber,
      documentUrl: result.documentUrl,
      raw: result.raw,
      error: null,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'provider call failed'
    log.warn('invoices.provider_reference_threw', { invoiceId: row.id, reason })
    return { documentNumber: null, documentUrl: null, raw: null, error: reason }
  }
}

/** Where a document's archived PDF lives in the bucket. */
export function invoiceStorageKey(orderId: string, documentNumber: string): string {
  return `invoices/${orderId}/${invoicePdfFileName(documentNumber)}`
}

/**
 * Archives the rendered PDF in R2 and returns its public URL, or null.
 *
 * Best effort: the document is the row and its number, and the archive is
 * a copy of it. On a deployment without R2 (the measured state of this
 * account) the row keeps `document_url` null and the account route renders
 * the same input on demand as a marked copy, so the customer is never
 * without the document; they are without a CDN copy of it.
 */
async function archivePdf(
  bytes: Uint8Array,
  key: string,
  invoiceId: string,
): Promise<string | null> {
  try {
    // Imported here rather than at the top of the file: `lib/storage/r2` is
    // `server-only`, and this module is reached from the refund action's tests
    // through `refund.ts`. A static import makes those test files fail to
    // resolve before a single assertion runs.
    const { createR2PresignedPutUrl, isR2Configured, r2PublicUrl } = await import(
      '@/lib/storage/r2'
    )
    if (!isR2Configured()) {
      log.info('invoices.archive_skipped', { invoiceId, key, reason: 'r2_unconfigured' })
      return null
    }
    const { uploadUrl, publicUrl } = await createR2PresignedPutUrl(key)
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: bytes as unknown as BodyInit,
    })
    if (!put.ok) {
      log.warn('invoices.archive_failed', { invoiceId, key, status: put.status })
      return null
    }
    return publicUrl || r2PublicUrl(key)
  } catch (error) {
    log.warn('invoices.archive_threw', {
      invoiceId,
      key,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

type EmailOutcome = 'sent' | 'skipped' | 'failed'

/**
 * Mails the document to the customer with the PDF attached.
 *
 * After the row is marked issued, never before: a mail that went out for a
 * document whose issued-write then failed would be a mail about a document
 * that is still pending and about to be issued again under the same number.
 * Deduplicated by the provider on the invoice id, so a replayed issue (the
 * cron re-finding a row whose issued-write raced) sends once.
 *
 * Never throws, and its outcome is recorded on the row in a separate,
 * tolerant UPDATE: `emailed_at` / `email_error` arrive with pending 257, and
 * a database without them must not fail a document that has been issued.
 */
async function emailDocument(
  admin: AdminClient,
  row: InvoiceRow,
  document: InvoiceDocument,
  documentNumber: string,
  bytes: Uint8Array,
  now: Date,
): Promise<EmailOutcome> {
  const to = document.customer.email?.trim()
  if (!to) {
    log.warn('invoices.email_skipped', { invoiceId: row.id, reason: 'no_recipient' })
    return 'skipped'
  }

  let outcome: EmailOutcome
  let error: string | null = null
  try {
    const built = buildInvoiceEmail({
      customerName: document.customer.name,
      documentType: document.documentType,
      documentNumber,
      orderId: row.order_id,
      totalAgorot: document.totalAgorot,
      siteUrl: siteUrl(),
    })
    const result = await sendEmail({
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      idempotencyKey: `invoice:${row.id}:issued`,
      attachments: [
        { filename: built.attachmentFileName, content: bytes, contentType: 'application/pdf' },
      ],
    })
    if (result.ok) outcome = 'sent'
    else if (result.skipped) {
      outcome = 'skipped'
      error = result.reason
    } else {
      outcome = 'failed'
      error = result.reason
    }
  } catch (caught) {
    outcome = 'failed'
    error = caught instanceof Error ? caught.message : 'send threw'
  }

  const { error: writeError } = await admin
    .from('invoices')
    .update(
      (outcome === 'sent'
        ? { emailed_at: now.toISOString(), email_error: null }
        : { email_error: (error ?? outcome).slice(0, 500) }) as never,
    )
    .eq('id', row.id)
  if (writeError) {
    // 42703 until 257 is applied. The send itself is logged either way.
    log.info('invoices.email_state_not_recorded', { invoiceId: row.id, reason: writeError.message })
  }

  log[outcome === 'failed' ? 'warn' : 'info']('invoices.email', {
    invoiceId: row.id,
    orderId: row.order_id,
    outcome,
    reason: error,
  })
  return outcome
}

// ---------------------------------------------------------------------------
// issueInvoice
// ---------------------------------------------------------------------------

export type IssueOutcome =
  | { ok: true; documentNumber: string; documentUrl: string | null; emailed: boolean }
  | { ok: false; reason: string; dead: boolean }

/**
 * Tells an operator that a document has stopped retrying.
 *
 * WHY THIS IS NOT JUST A LOG LINE. Five failures mean the platform has taken
 * money and not issued the receipt it owes; that is a legal obligation, not a
 * degraded feature. `log.error` is read by whoever already knows to look. The
 * outbox row survives a deploy, retries its own delivery, and lands in a
 * mailbox.
 *
 * Deduped on the INVOICE, not on the moment: the cron runs every ten minutes
 * and keeps finding the same dead row, so a time-based key would mail every ten
 * minutes about one problem, which is how alerting stops being read.
 *
 * Never throws, and is awaited before the failure is recorded rather than fired
 * and forgotten - a serverless invocation can be frozen the moment its response
 * is returned.
 */
async function alertAdminInvoiceDead(
  admin: AdminClient,
  row: InvoiceRow,
  reason: string,
  attempts: number,
): Promise<void> {
  // Wrapped, not merely error-checked. This runs inside `fail`, whose ACTUAL
  // job is to record the failure and set the backoff; an alert that threw would
  // leave the row un-updated and the queue retrying forever without ever
  // reaching `dead`. The alert is the least important thing on this path.
  try {
    const { error } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'invoice_dead',
      p_email: adminAlertRecipient(),
      p_dedupe: adminAlertDedupeKey('invoice_dead', row.id),
      p_payload: {
        order_id: row.order_id,
        order_ref: row.order_id.slice(0, 8).toUpperCase(),
        document_type:
          row.document_type === 'credit_note'
            ? 'חשבונית זיכוי'
            : row.document_type === 'coupon_receipt'
              ? 'קבלה על קופון'
              : 'חשבונית מס/קבלה',
        reason,
        attempts,
      },
    })
    if (error) log.error('invoices.dead_alert_failed', { invoiceId: row.id, reason: error.message })
  } catch (error) {
    log.error('invoices.dead_alert_threw', {
      invoiceId: row.id,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * Issues one queued document: numbers it, renders the platform's own PDF,
 * archives it, records it, and mails it.
 *
 * THE ORDER OF THE STEPS IS THE DESIGN.
 *
 *   1. Build the document from the order (refuses on a money mismatch).
 *   2. Number it: the row's own allocation, or a fresh one written to the
 *      row at once. Fails the attempt if the sequence cannot answer.
 *   3. Ask the provider for a reference copy. Best effort; never fails.
 *   4. Render the PDF under that number. Fails the attempt on a throw, with
 *      the number kept on the row for the retry.
 *   5. Archive to R2. Best effort; null URL without R2.
 *   6. Mark issued: `document_number` is OUR number, `document_url` the
 *      archive, `provider_response` carries the provider's reference and the
 *      archive key. `orders.invoice_number` follows for the sale's document.
 *   7. Email the customer with the PDF attached. Best effort, recorded.
 *
 * `orders.invoice_number` is written here and only here. Until [55] that
 * column had four readers and no writer, which is why searching the admin
 * order list by invoice number could not return a row.
 */
export async function issueInvoice(
  admin: AdminClient,
  row: InvoiceRow,
  now: Date = new Date(),
): Promise<IssueOutcome> {
  const attempts = row.attempts + 1

  const fail = async (reason: string): Promise<IssueOutcome> => {
    const dead = attempts >= MAX_ATTEMPTS
    if (dead) await alertAdminInvoiceDead(admin, row, reason, attempts)
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

  // 1. The document.
  let built: Awaited<ReturnType<typeof buildDocumentForRow>>
  try {
    built = await buildDocumentForRow(admin, row)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'build failed')
  }
  if ('error' in built) return fail(built.error)
  const { document } = built

  // 2. The number.
  const allocation = await ensureInvoiceNumber(admin, row, built.cardcomAccountId)
  if ('error' in allocation) return fail(allocation.error)

  // 3. The provider's reference copy.
  const provider = await requestProviderReference(built, row)

  // 4. The PDF.
  let bytes: Uint8Array
  try {
    bytes = await renderInvoicePdf({
      documentType: document.documentType,
      documentNumber: allocation.formatted,
      providerDocumentNumber: provider.documentNumber,
      issuedAt: now,
      generatedAt: now,
      copy: 'original',
      issuer: resolveInvoiceIssuer(built.cardcomAccountId),
      customer: document.customer,
      lines: document.lines,
      totalAgorot: document.totalAgorot,
      netAgorot: document.netAgorot,
      vatAgorot: document.vatAgorot,
      vatPercent: document.vatPercent,
      reference: document.reference,
      payment: { method: 'card', transactionId: built.transactionId },
      relatedDocumentNumber: built.relatedDocumentNumber,
    })
  } catch (error) {
    return fail(`render_failed: ${error instanceof Error ? error.message : 'unknown'}`)
  }

  // 5. The archive.
  const storageKey = invoiceStorageKey(row.order_id, allocation.formatted)
  const archivedUrl = await archivePdf(bytes, storageKey, row.id)

  // 6. The record.
  const { error: issuedError } = await admin
    .from('invoices')
    .update({
      status: 'issued',
      attempts,
      document_number: allocation.formatted,
      document_url: archivedUrl,
      issued_at: now.toISOString(),
      provider_response: {
        platform: {
          series: allocation.series,
          internal_number: allocation.internalNumber,
          storage: archivedUrl ? 'r2' : 'none',
          storage_key: storageKey,
          issued_by: 'kenyonexpress',
        },
        provider: {
          document_number: provider.documentNumber,
          document_url: provider.documentUrl,
          error: provider.error,
          raw: provider.raw,
        },
      } as never,
      last_error: null,
    } as never)
    .eq('id', row.id)
  if (issuedError) return fail(`issued_write_failed: ${issuedError.message}`)

  if (row.document_type !== 'credit_note') {
    // Only the sale's own document names the order. A credit note has its own
    // number and must not overwrite the invoice number of the sale it reverses.
    await admin
      .from('orders')
      .update({ invoice_number: allocation.formatted } as never)
      .eq('id', row.order_id)
  }

  // 7. The customer's copy.
  const emailed = await emailDocument(admin, row, document, allocation.formatted, bytes, now)

  log.info('invoices.issued', {
    invoiceId: row.id,
    orderId: row.order_id,
    documentNumber: allocation.formatted,
    providerDocumentNumber: provider.documentNumber,
    archived: archivedUrl != null,
    emailed,
  })

  return {
    ok: true,
    documentNumber: allocation.formatted,
    documentUrl: archivedUrl,
    emailed: emailed === 'sent',
  }
}

const QUEUE_COLUMNS =
  'id, order_id, payment_id, document_type, status, idempotency_key, total_agorot, net_agorot, vat_agorot, vat_percent, attempts, series, internal_number'

/** Rows the queue owes work on, oldest deadline first. */
export async function loadDueInvoices(
  admin: AdminClient,
  limit: number,
  now: Date = new Date(),
): Promise<InvoiceRow[]> {
  const { data, error } = await admin
    .from('invoices')
    .select(QUEUE_COLUMNS)
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
      .select(QUEUE_COLUMNS)
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

// ---------------------------------------------------------------------------
// Reading an issued document
// ---------------------------------------------------------------------------

/** The issued sale document for an order, if there is one. */
export async function getOrderInvoice(
  admin: AdminClient,
  orderId: string,
): Promise<{
  id: string
  documentNumber: string | null
  documentUrl: string | null
  issuedAt: string | null
} | null> {
  const { data, error } = await admin
    .from('invoices')
    .select('id, document_number, document_url, issued_at')
    .eq('order_id', orderId)
    .neq('document_type', 'credit_note')
    .eq('status', 'issued')
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as {
    id: string
    document_number: string | null
    document_url: string | null
    issued_at: string | null
  }
  return {
    id: row.id,
    documentNumber: row.document_number,
    documentUrl: row.document_url,
    issuedAt: row.issued_at,
  }
}

export interface RenderedInvoice {
  bytes: Uint8Array
  fileName: string
  documentNumber: string
}

/**
 * Re-renders an issued document from its row, marked "העתק".
 *
 * For the account route on a deployment without an archive (no R2), and for
 * any archived copy that cannot be fetched. The input is the same the issue
 * path used - the row's number, VAT split and issue date, the order's lines -
 * so the copy cannot disagree with the original about the money, and
 * `buildDocumentForRow` still refuses if the order has changed under it.
 * Returns null for a row that is not issued, or whose order no longer
 * describes the document.
 */
export async function renderIssuedInvoiceCopy(
  admin: AdminClient,
  invoiceId: string,
  now: Date = new Date(),
): Promise<RenderedInvoice | null> {
  const { data, error } = await admin
    .from('invoices')
    .select(`${QUEUE_COLUMNS}, document_number, issued_at, provider_response`)
    .eq('id', invoiceId)
    .eq('status', 'issued')
    .maybeSingle()
  if (error) {
    log.warn('invoices.copy_read_failed', { invoiceId, reason: error.message })
    return null
  }
  const row = data as unknown as
    | (InvoiceRow & {
        document_number: string | null
        issued_at: string | null
        provider_response: { provider?: { document_number?: unknown } } | null
      })
    | null
  if (!row?.document_number) return null

  const built = await buildDocumentForRow(admin, row)
  if ('error' in built) {
    log.warn('invoices.copy_refused', { invoiceId, reason: built.error })
    return null
  }

  const providerNumber = row.provider_response?.provider?.document_number
  const bytes = await renderInvoicePdf({
    documentType: built.document.documentType,
    documentNumber: row.document_number,
    providerDocumentNumber: typeof providerNumber === 'string' ? providerNumber : null,
    issuedAt: row.issued_at ? new Date(row.issued_at) : now,
    generatedAt: now,
    copy: 'copy',
    issuer: resolveInvoiceIssuer(built.cardcomAccountId),
    customer: built.document.customer,
    lines: built.document.lines,
    totalAgorot: built.document.totalAgorot,
    netAgorot: built.document.netAgorot,
    vatAgorot: built.document.vatAgorot,
    vatPercent: built.document.vatPercent,
    reference: built.document.reference,
    payment: { method: 'card', transactionId: built.transactionId },
    relatedDocumentNumber: built.relatedDocumentNumber,
  })

  return {
    bytes,
    fileName: invoicePdfFileName(row.document_number),
    documentNumber: row.document_number,
  }
}
