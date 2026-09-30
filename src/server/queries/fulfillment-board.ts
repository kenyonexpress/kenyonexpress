import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { type FulfillmentLane, laneFor } from '@/server/domain/orders/fulfillment-lanes'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The rows behind the fulfilment board and its CSV export, one loader for
 * both so the file an operator downloads is the board they were looking at.
 *
 * Takes the caller's client: the page passes the RLS client (an admin can
 * read orders), the export route passes the same. No service role here.
 */

export interface BoardLine {
  id: string
  product_type: string
  item_status: string
  carrier: string | null
  tracking_number: string | null
}

export interface BoardOrder {
  id: string
  ref: string
  invoice_number: string | null
  status: string
  lane: FulfillmentLane
  /** Integer agorot, the money rule. Read from the agorot twin when present. */
  total_agorot: number
  created_at: string
  customer: string
  email: string
  phone: string
  city: string
  couponLines: number
  physicalLines: number
  lines: BoardLine[]
}

export interface BoardFilters {
  q?: string
  from?: string
  to?: string
  lane?: FulfillmentLane
  ids?: string[]
}

export type BoardResult = { orders: BoardOrder[]; error: null } | { orders: []; error: string }

/** The board is a working surface, not an archive: the newest rows only. */
export const BOARD_LIMIT = 300

type Client = Pick<SupabaseClient, 'from'>

/**
 * Agorot from an order row. The agorot twin (post-059 columns) is the money;
 * the `_ils` numeric is the pre-059 column the twin mirrors, read only when
 * the twin is null, and rounded once at the boundary. No arithmetic on the
 * result happens anywhere in this feature.
 */
export function orderAgorot(row: {
  total_ils_agorot: number | null
  total_ils: number | string | null
}): number {
  if (typeof row.total_ils_agorot === 'number') return row.total_ils_agorot
  const ils = typeof row.total_ils === 'string' ? Number(row.total_ils) : (row.total_ils ?? 0)
  return Number.isFinite(ils) ? Math.round(ils * 100) : 0
}

export async function loadBoardOrders(
  supabase: Client,
  filters: BoardFilters,
  limit: number = BOARD_LIMIT,
): Promise<BoardResult> {
  // Same customer resolution as the list page: the term is sanitised before
  // it enters an `.or()`, where , ( ) " and \ are structural.
  const searchTerm = filters.q ? sanitizeOrTerm(filters.q) : ''
  let matchedUserIds: string[] = []
  if (searchTerm) {
    const { data: matched } = await supabase
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .limit(50)
    matchedUserIds = ((matched ?? []) as { id: string }[]).map((p) => p.id)
  }

  let query = supabase
    .from('orders')
    .select(
      'id, invoice_number, status, total_ils, total_ils_agorot, created_at, user_id, address_id, profiles(full_name, email, phone), user_addresses(city, phone, full_name), order_items(id, product_type, item_status, carrier, tracking_number)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.ids && filters.ids.length > 0) query = query.in('id', filters.ids)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`)
  if (searchTerm) {
    const idList = matchedUserIds.map((id) => `user_id.eq.${id}`).join(',')
    query = query.or([`invoice_number.ilike.%${searchTerm}%`, idList].filter(Boolean).join(','))
  }

  const { data, error } = await query
  if (error) return { orders: [], error: error.message }

  const rows = (data ?? []) as unknown as {
    id: string
    invoice_number: string | null
    status: string
    total_ils: number | string | null
    total_ils_agorot: number | null
    created_at: string
    profiles:
      | { full_name: string | null; email: string; phone: string | null }
      | { full_name: string | null; email: string; phone: string | null }[]
      | null
    user_addresses:
      | { city: string; phone: string; full_name: string }
      | { city: string; phone: string; full_name: string }[]
      | null
    order_items: BoardLine[] | null
  }[]

  const orders = rows.map((row): BoardOrder => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const address = Array.isArray(row.user_addresses) ? row.user_addresses[0] : row.user_addresses
    const lines = Array.isArray(row.order_items) ? row.order_items : []
    return {
      id: row.id,
      ref: row.invoice_number ?? row.id.slice(0, 8).toUpperCase(),
      invoice_number: row.invoice_number,
      status: row.status,
      lane: laneFor({ status: row.status, lines }),
      total_agorot: orderAgorot(row),
      created_at: row.created_at,
      customer: profile?.full_name ?? address?.full_name ?? profile?.email ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? address?.phone ?? '',
      city: address?.city ?? '',
      couponLines: lines.filter((l) => l.product_type === 'coupon').length,
      physicalLines: lines.filter((l) => l.product_type === 'physical').length,
      lines,
    }
  })

  return {
    orders: filters.lane ? orders.filter((o) => o.lane === filters.lane) : orders,
    error: null,
  }
}
