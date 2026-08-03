import { log } from '@/lib/observability/log'
import 'server-only'

import type { FunnelRow, SaleLine } from '@/lib/analytics/aggregate'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'

// Data loading for the admin analytics dashboard.
//
// Read with the service client after requireAdminPage: the guard is the
// application-level check, the same pattern the rest of the admin panel uses.
//
// Money is read from the agorot snapshot columns on order_items, which are the
// columns that actually exist and are written by beginCheckout. They are
// integers frozen at purchase time, so reports are exact and immune to later
// commission changes. The _ils numeric columns are legacy mirrors and are not
// used for arithmetic here.

const MAX_LINES = 20_000

type OrderItemRow = {
  order_id: string
  product_id: string | null
  product_type: string
  upfront_percent: number | null
  platform_percent: number | null
  face_value_agorot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
  supplier_immediate_agorot: number | null
  escrow_release_agorot: number | null
  products: { name_he: string } | { name_he: string }[] | null
  orders: { paid_at: string } | { paid_at: string }[] | null
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** Start of the window, as an ISO timestamp `days` before now. */
export function windowStart(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export type SalesLoad = {
  lines: SaleLine[]
  /** True when the window hit the row cap, so totals understate reality. */
  truncated: boolean
}

/**
 * Every paid order line in the window, flattened for the aggregation engine.
 *
 * Aggregating in TypeScript rather than SQL is a deliberate trade at this
 * volume: one simple indexed query feeds every panel on the page, and the
 * arithmetic lives in a unit-tested module instead of in six views. The row cap
 * is the trigger to revisit that, and it is reported rather than hidden.
 */
export async function loadSalesLines(days: number): Promise<SalesLoad> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('order_items')
    .select(
      `order_id, product_id, product_type, upfront_percent, platform_percent,
       face_value_agorot, paid_on_site_agorot, commission_agorot,
       supplier_immediate_agorot, escrow_release_agorot,
       products(name_he),
       orders!inner(paid_at)`,
    )
    .is('deleted_at', null)
    .is('orders.deleted_at', null)
    .not('orders.paid_at', 'is', null)
    .gte('orders.paid_at', windowStart(days))
    .limit(MAX_LINES)

  if (error || !data) {
    log.error('analytics.sales_lines_failed', { reason: error?.message })
    return { lines: [], truncated: false }
  }

  const lines: SaleLine[] = []
  for (const row of data as unknown as OrderItemRow[]) {
    const order = firstOf(row.orders)
    if (!order?.paid_at) continue

    const supplierDue = (row.supplier_immediate_agorot ?? 0) + (row.escrow_release_agorot ?? 0)

    lines.push({
      paidAt: order.paid_at,
      orderId: row.order_id,
      productId: row.product_id,
      productName: firstOf(row.products)?.name_he ?? null,
      productType: row.product_type,
      // upfront_percent is the settlement snapshot; platform_percent is the
      // legacy mirror written alongside it.
      platformPercent: row.upfront_percent ?? row.platform_percent,
      gmvIls: agorotToIls(agorot(row.face_value_agorot ?? 0)),
      chargedOnSiteIls: agorotToIls(agorot(row.paid_on_site_agorot ?? 0)),
      platformFeeIls: agorotToIls(agorot(row.commission_agorot ?? 0)),
      supplierDueIls: agorotToIls(agorot(supplierDue)),
    })
  }

  return { lines, truncated: data.length >= MAX_LINES }
}

export type FunnelLoad =
  | { available: true; row: FunnelRow; days: number }
  | { available: false; reason: string }

/**
 * The behavioral funnel from v_funnel_daily, summed over the window.
 *
 * Returns unavailable rather than throwing when the analytics migrations are
 * not applied yet: the money panels on this page are useful on their own, and
 * a missing view is a deployment state, not an error the admin caused.
 */
export async function loadFunnel(days: number): Promise<FunnelLoad> {
  const admin = createAdminClient()
  const since = windowStart(days).slice(0, 10)

  const { data, error } = await admin
    .from('v_funnel_daily')
    .select('sessions, product_views, add_to_carts, checkout_steps, checkouts, purchases')
    .gte('day_il', since)

  if (error) {
    return { available: false, reason: error.message }
  }

  const row: FunnelRow = {
    sessions: 0,
    productViews: 0,
    addToCarts: 0,
    checkoutSteps: 0,
    checkouts: 0,
    purchases: 0,
  }

  for (const day of data ?? []) {
    row.sessions += Number(day.sessions ?? 0)
    row.productViews += Number(day.product_views ?? 0)
    row.addToCarts += Number(day.add_to_carts ?? 0)
    row.checkoutSteps += Number(day.checkout_steps ?? 0)
    row.checkouts += Number(day.checkouts ?? 0)
    row.purchases += Number(day.purchases ?? 0)
  }

  return { available: true, row, days }
}
