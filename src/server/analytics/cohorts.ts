import { log } from '@/lib/observability/log'
import 'server-only'

import { type CohortOrder, israelMonthKey } from '@/lib/analytics/cohorts'
import { createAdminClient } from '@/lib/supabase/admin'
import { windowStart } from '@/server/analytics/queries'

// Data loading for the revenue cohort page. Same rules as queries.ts: the
// service client behind requireAdminPage, money from the agorot snapshot
// columns, arithmetic in the unit-tested lib module and not in SQL.

const MAX_ORDERS = 50_000

export type CohortLoad = {
  orders: CohortOrder[]
  /** YYYY-MM of "now" in Israel, the last month the grid may show. */
  throughMonth: string
  /** True when the window hit the row cap, so cohorts understate reality. */
  truncated: boolean
  /** Set when the read failed; the page renders the reason instead of zeros. */
  error: string | null
}

/**
 * Every paid order in the window, one row each. The window must reach back
 * to the earliest acquisition the page wants to show, because a customer's
 * cohort is the month of their first paid order INSIDE the rows returned:
 * a window starting after that month would make a returning customer look
 * newly acquired.
 *
 * Revenue is what was CHARGED ON SITE for the order, summed from the item
 * snapshots: the same number the analytics page and the ad platforms report,
 * so the three cannot disagree.
 */
export async function loadCohortOrders(days: number, now: Date = new Date()): Promise<CohortLoad> {
  const admin = createAdminClient()
  const throughMonth = israelMonthKey(now.toISOString())

  const { data, error } = await admin
    .from('order_items')
    .select('order_id, paid_on_site_agorot, orders!inner(user_id, paid_at)')
    .is('deleted_at', null)
    .is('orders.deleted_at', null)
    .not('orders.paid_at', 'is', null)
    .gte('orders.paid_at', windowStart(days, now))
    .limit(MAX_ORDERS)

  if (error || !data) {
    log.error('analytics.cohort_orders_failed', { reason: error?.message })
    return { orders: [], throughMonth, truncated: false, error: error?.message ?? 'no data' }
  }

  type Row = {
    order_id: string
    paid_on_site_agorot: number | null
    orders:
      | { user_id: string; paid_at: string | null }
      | { user_id: string; paid_at: string | null }[]
      | null
  }

  const byOrder = new Map<string, CohortOrder>()
  for (const row of data as unknown as Row[]) {
    const order = Array.isArray(row.orders) ? (row.orders[0] ?? null) : row.orders
    if (!order?.paid_at) continue
    const amount = row.paid_on_site_agorot ?? 0
    if (!Number.isSafeInteger(amount)) continue
    const existing = byOrder.get(row.order_id)
    if (existing) {
      existing.revenueAgorot += amount
    } else {
      byOrder.set(row.order_id, {
        orderId: row.order_id,
        userId: order.user_id,
        paidAt: order.paid_at,
        revenueAgorot: amount,
      })
    }
  }

  return {
    orders: [...byOrder.values()],
    throughMonth,
    truncated: data.length >= MAX_ORDERS,
    error: null,
  }
}
