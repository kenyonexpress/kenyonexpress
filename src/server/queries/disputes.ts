import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { EvidenceInput } from '@/server/domain/disputes/evidence'

/**
 * Reads for the dispute console and the evidence pack.
 *
 * ALL OF THESE CAN 42P01, because `disputes` arrives with
 * `migrations/pending/202`. That state is reported as its own value rather than
 * as an empty list: a console that renders "אין תיקים" over a table that does
 * not exist tells the operator the opposite of the truth, and the difference
 * matters most on the page whose whole job is a deadline.
 */

type Client = ReturnType<typeof createAdminClient>

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

/** The sentinel every reader here returns when 202 is not applied. */
export const NOT_APPLIED = 'NOT_APPLIED' as const
export type NotApplied = typeof NOT_APPLIED

export type DisputeRow = {
  id: string
  order_id: string
  provider_ref: string
  kind: string
  status: string
  reason_code: string | null
  amount_agorot: number
  opened_at: string
  respond_by: string
  resolved_at: string | null
  notes: string | null
}

export async function listDisputes(client: Client): Promise<DisputeRow[] | NotApplied> {
  const { data, error } = await client
    .from('disputes')
    .select(
      'id, order_id, provider_ref, kind, status, reason_code, amount_agorot, opened_at, respond_by, resolved_at, notes',
    )
    // Open cases first, then by how soon the answer is due. A dispute console
    // sorted by creation date buries the one that expires tomorrow.
    .order('resolved_at', { ascending: true, nullsFirst: true })
    .order('respond_by', { ascending: true })
    .limit(200)

  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) return NOT_APPLIED
    log.error('disputes.list_failed', { reason: error.message })
    return []
  }
  return (data ?? []) as unknown as DisputeRow[]
}

/**
 * Everything the evidence pack needs, in one place.
 *
 * SEVEN READS AND NOT ONE JOIN, on purpose. PostgREST can embed these, and the
 * embed would break the moment one of the relationships is not what the
 * generated types say - which is the standing condition of this project, where
 * the file chain and production have diverged. Seven independent reads degrade
 * one section at a time; one embedded read that fails produces no pack at all,
 * on the day somebody has forty-eight hours to answer a bank.
 */
export async function loadDisputeEvidence(
  client: Client,
  disputeId: string,
): Promise<Omit<EvidenceInput, 'generatedAt'> | null | NotApplied> {
  const { data: dispute, error: disputeError } = await client
    .from('disputes')
    .select(
      'id, order_id, provider_ref, kind, amount_agorot, opened_at, respond_by, reason_code, notes',
    )
    .eq('id', disputeId)
    .maybeSingle()

  if (disputeError) {
    if (MISSING_TABLE.has(disputeError.code ?? '')) return NOT_APPLIED
    log.error('disputes.evidence_read_failed', { disputeId, reason: disputeError.message })
    return null
  }
  if (!dispute) return null

  const row = dispute as unknown as {
    id: string
    order_id: string
    provider_ref: string
    kind: string
    amount_agorot: number
    opened_at: string
    respond_by: string
    reason_code: string | null
    notes: string | null
  }

  const { data: order, error: orderError } = await client
    .from('orders')
    .select('id, status, created_at, paid_at, accepted_terms_at, total_ils, user_id')
    .eq('id', row.order_id)
    .maybeSingle()
  // Logged rather than thrown: the pack is still worth producing without the
  // order header, and a dispute with a deadline on it must not become
  // unanswerable because one read failed. Every section states its own absence.
  if (orderError) {
    log.warn('disputes.order_read_failed', { orderId: row.order_id, reason: orderError.message })
  }

  const orderRow = order as unknown as {
    id: string
    status: string
    created_at: string
    paid_at: string | null
    accepted_terms_at: string | null
    total_ils: number | null
    user_id: string
  } | null

  const [profile, items, payments, vouchers, refundRequests] = await Promise.all([
    orderRow ? readProfile(client, orderRow.user_id) : Promise.resolve(null),
    readItems(client, row.order_id),
    readPayments(client, row.order_id),
    readVoucherIds(client, row.order_id),
    readRefundRequests(client, row.order_id),
  ])

  const redemptions = await readRedemptions(client, vouchers)

  return {
    dispute: {
      providerRef: row.provider_ref,
      kind: row.kind,
      amountAgorot: row.amount_agorot,
      openedAt: row.opened_at,
      respondBy: row.respond_by,
      reasonCode: row.reason_code,
      notes: row.notes,
    },
    order: {
      id: row.order_id,
      status: orderRow?.status ?? 'unknown',
      createdAt: orderRow?.created_at ?? row.opened_at,
      paidAt: orderRow?.paid_at ?? null,
      acceptedTermsAt: orderRow?.accepted_terms_at ?? null,
      // `total_ils` is the pre-059 column this database actually has; agorot at
      // the boundary, like every other money read on this project.
      totalAgorot: orderRow?.total_ils != null ? Math.round(orderRow.total_ils * 100) : null,
      customerEmail: profile?.email ?? null,
      customerName: profile?.full_name ?? null,
    },
    items,
    payments,
    redemptions,
    refundRequests,
  }
}

async function readProfile(
  client: Client,
  userId: string,
): Promise<{ email: string | null; full_name: string | null } | null> {
  const { data, error } = await client
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    log.warn('disputes.profile_read_failed', { userId, reason: error.message })
    return null
  }
  return (data as unknown as { email: string | null; full_name: string | null }) ?? null
}

/**
 * COLUMN NAMES MEASURED, NOT GUESSED (2026-09-09). `order_items` has NO
 * `product_name` and NO `line_total_ils`; it carries `product_id`,
 * `total_price_ils` and a snapshotted `supplier_name`. The first draft of this
 * function named the two that do not exist, which 42703s and takes down the
 * whole select - and because the caller degrades a failed read to an empty
 * list, the pack would have said "לא נמצאו שורות בהזמנה" about an order with
 * items in it. A wrong sentence in a document submitted to a bank under our
 * name is the worst failure this file can have, which is why the names were
 * checked against `information_schema` rather than against the generated types.
 *
 * The NAME comes from `products.name_he` in a second read: `order_items`
 * snapshots the supplier's identity but not the product's title, so there is no
 * as-purchased name to quote. That is a real limitation of the snapshot and it
 * is stated here rather than hidden behind a renamed product.
 */
async function readItems(client: Client, orderId: string): Promise<EvidenceInput['items']> {
  const { data, error } = await client
    .from('order_items')
    .select('product_id, quantity, total_price_ils, supplier_name')
    .eq('order_id', orderId)
  if (error) {
    log.warn('disputes.items_read_failed', { orderId, reason: error.message })
    return []
  }

  const rows = (data ?? []) as unknown as Array<{
    product_id: string | null
    quantity: number | null
    total_price_ils: number | null
    supplier_name: string | null
  }>

  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: products, error: productsError } = await client
      .from('products')
      .select('id, name_he')
      .in('id', productIds)
    // A name we could not read becomes the generic 'פריט' below, which is
    // honest. Silently dropping the error would make an unreachable products
    // table look like a catalogue of unnamed products.
    if (productsError) {
      log.warn('disputes.product_names_read_failed', { reason: productsError.message })
    }
    for (const product of (products ?? []) as unknown as Array<{
      id: string
      name_he: string | null
    }>) {
      if (product.name_he) names.set(product.id, product.name_he)
    }
  }

  return rows.map((item) => ({
    productName: (item.product_id ? names.get(item.product_id) : null) ?? 'פריט',
    quantity: item.quantity ?? 1,
    totalAgorot: item.total_price_ils != null ? Math.round(item.total_price_ils * 100) : 0,
    supplierName: item.supplier_name,
  }))
}

async function readPayments(client: Client, orderId: string): Promise<EvidenceInput['payments']> {
  const { data, error } = await client
    .from('payments')
    .select('id, status, created_at, cardcom_transaction_id, amount_ils')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) {
    log.warn('disputes.payments_read_failed', { orderId, reason: error.message })
    return []
  }
  return (
    (data ?? []) as unknown as Array<{
      id: string
      status: string
      created_at: string
      cardcom_transaction_id: string | null
      amount_ils: number | null
    }>
  ).map((payment) => ({
    id: payment.id,
    status: payment.status,
    createdAt: payment.created_at,
    transactionId: payment.cardcom_transaction_id,
    // The PAN's last four is not on `payments` and is deliberately not joined
    // in from `payment_tokens`: the link column does not exist in production
    // (see `payment-token-column.ts`), so the honest value here is nothing.
    last4: null,
    amountAgorot: payment.amount_ils != null ? Math.round(payment.amount_ils * 100) : null,
  }))
}

async function readVoucherIds(client: Client, orderId: string): Promise<string[]> {
  const { data, error } = await client.from('vouchers').select('id').eq('order_id', orderId)
  if (error) {
    log.warn('disputes.vouchers_read_failed', { orderId, reason: error.message })
    return []
  }
  return ((data ?? []) as unknown as Array<{ id: string }>).map((voucher) => voucher.id)
}

async function readRedemptions(
  client: Client,
  voucherIds: string[],
): Promise<EvidenceInput['redemptions']> {
  if (voucherIds.length === 0) return []
  const { data, error } = await client
    .from('voucher_redemptions')
    .select('code_entered, outcome, created_at, scan_method, ip_address, supplier_id')
    .in('voucher_id', voucherIds)
    .order('created_at', { ascending: true })
  if (error) {
    log.warn('disputes.redemptions_read_failed', { reason: error.message })
    return []
  }

  const rows = (data ?? []) as unknown as Array<{
    code_entered: string
    outcome: string
    created_at: string
    scan_method: string | null
    ip_address: unknown
    supplier_id: string | null
  }>

  const supplierIds = [
    ...new Set(rows.map((r) => r.supplier_id).filter((id): id is string => !!id)),
  ]
  const names = new Map<string, string>()
  if (supplierIds.length > 0) {
    const { data: suppliers, error: suppliersError } = await client
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds)
    if (suppliersError) {
      log.warn('disputes.supplier_names_read_failed', { reason: suppliersError.message })
    }
    for (const supplier of (suppliers ?? []) as unknown as Array<{
      id: string
      name: string | null
    }>) {
      if (supplier.name) names.set(supplier.id, supplier.name)
    }
  }

  return rows.map((r) => ({
    code: r.code_entered,
    outcome: r.outcome,
    at: r.created_at,
    supplierName: r.supplier_id ? (names.get(r.supplier_id) ?? null) : null,
    // The till operator's name is on `supplier_staff` through a nullable
    // `staff_id`, and a PIN-less scan has none. Left out rather than joined for
    // a value that is usually absent.
    staffName: null,
    scanMethod: r.scan_method,
    ip: typeof r.ip_address === 'string' ? r.ip_address : null,
  }))
}

async function readRefundRequests(
  client: Client,
  orderId: string,
): Promise<EvidenceInput['refundRequests']> {
  const { data, error } = await client
    .from('refund_requests')
    .select('status, reason_code, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) {
    // 42P01 is the expected state until 202 is applied. Silent, because the
    // pack states the absence in words either way.
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('disputes.refund_requests_read_failed', { orderId, reason: error.message })
    }
    return []
  }
  return (
    (data ?? []) as unknown as Array<{ status: string; reason_code: string; created_at: string }>
  ).map((request) => ({
    status: request.status,
    reasonCode: request.reason_code,
    createdAt: request.created_at,
  }))
}
