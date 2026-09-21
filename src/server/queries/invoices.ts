import { type Agorot, agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Invoice reads for the two section-56 screens.
 *
 * Both go through the service role and filter here, like the order pages do:
 * `invoices` has an owner-read policy, but the account list needs the order's
 * reference and the admin list needs every customer's rows, and one read path
 * with the ownership stated in the query is easier to audit than two.
 */

export type MyInvoiceRow = {
  id: string
  orderId: string
  orderRef: string
  documentType: string
  status: string
  documentNumber: string | null
  hasDocument: boolean
  totalAgorot: Agorot
  netAgorot: Agorot
  vatAgorot: Agorot
  vatPercent: number | null
  issuedAt: string | null
  createdAt: string
}

type InvoiceRead = {
  id: string
  order_id: string
  document_type: string
  status: string
  document_number: string | null
  document_url: string | null
  total_agorot: number | null
  net_agorot: number | null
  vat_agorot: number | null
  vat_percent: number | null
  issued_at: string | null
  created_at: string
}

const INVOICE_COLUMNS =
  'id, order_id, document_type, status, document_number, document_url, total_agorot, net_agorot, vat_agorot, vat_percent, issued_at, created_at'

function toRow(r: InvoiceRead): MyInvoiceRow {
  return {
    id: r.id,
    orderId: r.order_id,
    orderRef: r.order_id.slice(0, 8).toUpperCase(),
    documentType: r.document_type,
    status: r.status,
    documentNumber: r.document_number,
    hasDocument: Boolean(r.document_url),
    totalAgorot: agorot(r.total_agorot ?? 0),
    netAgorot: agorot(r.net_agorot ?? 0),
    vatAgorot: agorot(r.vat_agorot ?? 0),
    vatPercent: r.vat_percent,
    issuedAt: r.issued_at,
    createdAt: r.created_at,
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** The signed-in customer's documents, newest first. */
export async function getMyInvoices(): Promise<MyInvoiceRow[]> {
  const userId = await currentUserId()
  if (!userId) return []
  const admin = createAdminClient()
  const { data: orders, error: ordersError } = await admin
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (ordersError) {
    log.warn('invoices.my_orders_read_failed', { reason: ordersError.message })
    return []
  }
  const orderIds = (orders ?? []).map((o) => o.id)
  if (orderIds.length === 0) return []
  const { data, error } = await admin
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .in('order_id', orderIds)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    log.warn('invoices.my_invoices_read_failed', { reason: error.message })
    return []
  }
  return ((data ?? []) as unknown as InvoiceRead[]).map(toRow)
}

export type AdminInvoiceRow = MyInvoiceRow & {
  customerEmail: string | null
  lastError: string | null
  attempts: number
  documentUrl: string | null
}

type AdminInvoiceRead = InvoiceRead & { last_error: string | null; attempts: number | null }

/** The admin list: an optional search, a status filter, newest first. */
export async function searchInvoices(input: {
  search: { kind: 'document' | 'order' | 'email' | 'none'; value?: string }
  status: string | null
  limit?: number
}): Promise<{ rows: AdminInvoiceRow[]; error: string | null }> {
  const admin = createAdminClient()
  let orderIds: string[] | null = null

  if (input.search.kind === 'email' && input.search.value) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', `%${input.search.value}%`)
      .limit(50)
    if (profilesError) return { rows: [], error: profilesError.message }
    const userIds = (profiles ?? []).map((p) => p.id)
    if (userIds.length === 0) return { rows: [], error: null }
    const { data: orders, error: ordersError } = await admin
      .from('orders')
      .select('id')
      .in('user_id', userIds)
      .limit(500)
    if (ordersError) return { rows: [], error: ordersError.message }
    orderIds = (orders ?? []).map((o) => o.id)
    if (orderIds.length === 0) return { rows: [], error: null }
  }

  let query = admin
    .from('invoices')
    .select(`${INVOICE_COLUMNS}, last_error, attempts`)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 100)
  if (input.status) query = query.eq('status', input.status)
  if (input.search.kind === 'order' && input.search.value) {
    query = query.eq('order_id', input.search.value)
  }
  if (input.search.kind === 'document' && input.search.value) {
    query = query.ilike('document_number', `%${input.search.value}%`)
  }
  if (orderIds) query = query.in('order_id', orderIds)

  const { data, error } = await query
  if (error) return { rows: [], error: error.message }
  const rows = (data ?? []) as unknown as AdminInvoiceRead[]

  // The customer column: order -> user -> profile, two reads keyed by id, no
  // embed (orders.user_id points at auth.users, not profiles; see admin/orders).
  const ids = [...new Set(rows.map((r) => r.order_id))]
  const emailByOrder = new Map<string, string | null>()
  if (ids.length > 0) {
    const { data: orders, error: ordersError } = await admin
      .from('orders')
      .select('id, user_id')
      .in('id', ids)
    if (ordersError) log.warn('invoices.admin_orders_read_failed', { reason: ordersError.message })
    const userIds = [
      ...new Set((orders ?? []).map((o) => o.user_id).filter((v): v is string => Boolean(v))),
    ]
    const emailByUser = new Map<string, string | null>()
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', userIds)
      if (profilesError)
        log.warn('invoices.admin_profiles_read_failed', { reason: profilesError.message })
      for (const p of profiles ?? []) emailByUser.set(p.id, p.email)
    }
    for (const o of orders ?? []) {
      emailByOrder.set(o.id, o.user_id ? (emailByUser.get(o.user_id) ?? null) : null)
    }
  }

  return {
    rows: rows.map((r) => ({
      ...toRow(r),
      customerEmail: emailByOrder.get(r.order_id) ?? null,
      lastError: r.last_error,
      attempts: r.attempts ?? 0,
      documentUrl: r.document_url,
    })),
    error: null,
  }
}
