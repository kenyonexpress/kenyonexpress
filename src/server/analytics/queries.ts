import { log } from '@/lib/observability/log'
import 'server-only'

import type { FunnelRow, SaleLine } from '@/lib/analytics/aggregate'
import {
  PAYOUT_DUE_STATUSES,
  type RefundCounts,
  type StandingCounts,
  type VoucherCounts,
  sumPayoutsDue,
} from '@/lib/analytics/ops-kpis'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { parseIls } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { supplierDueAgorot } from '@/lib/supplier/dashboard'

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
  supplier_id: string | null
  suppliers: { name: string } | { name: string }[] | null
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
       supplier_id, suppliers(name),
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

    // The immediate split ONLY. `+ escrow_release_agorot` was the abolished
    // escrow model: under it the supplier's share of a coupon prepayment was
    // held until the scan and released then. Ofir reversed that on 2026-07-28
    // and migration 085 removed the release path from the database, so the
    // whole coupon prepayment is the platform's at payment and no release ever
    // happens. Two legacy order_items still carry a non-zero
    // escrow_release_agorot, so this line was inflating supplier revenue in
    // analytics by money that was never released.
    const supplierDue = supplierDueAgorot({
      supplierImmediateAgorot: row.supplier_immediate_agorot ?? 0,
    })

    lines.push({
      paidAt: order.paid_at,
      orderId: row.order_id,
      productId: row.product_id,
      productName: firstOf(row.products)?.name_he ?? null,
      supplierId: row.supplier_id ?? null,
      supplierName: firstOf(row.suppliers)?.name ?? null,
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

/**
 * The counts behind the two rate tiles.
 *
 * Six `head: true` counts rather than one join: PostgREST cannot express
 * "count rows grouped by status" in a single call without a view, and six
 * indexed counts on a catalogue this size cost less than the view would cost to
 * maintain. Each one returns a number and no rows.
 *
 * WINDOWED ON DIFFERENT COLUMNS ON PURPOSE. Orders are windowed on `paid_at`,
 * because an order enters the refund denominator when it is paid. Vouchers are
 * windowed on `issued_at`, because a voucher enters the redemption denominator
 * when it is issued. Using one column for both would put a voucher issued last
 * month and redeemed today on the wrong side of the boundary.
 */
export interface RateCounts {
  paidOrders: number
  refundedOrders: number
  vouchersIssued: number
  vouchersRedeemed: number
  vouchersCancelled: number
  vouchersRefunded: number
}

export async function loadRateCounts(days: number): Promise<RateCounts> {
  const admin = createAdminClient()
  const since = windowStart(days)

  // Written out rather than built by a helper: a generic that returns a
  // PostgREST builder makes tsc give up with TS2589 (type instantiation
  // excessively deep), and six plain statements are clearer than the generic
  // that would have saved four lines.
  const paidOrders = () =>
    admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', since)
  const vouchers = () =>
    admin.from('vouchers').select('id', { count: 'exact', head: true }).gte('issued_at', since)

  const [paid, refunded, issued, redeemed, cancelled, vRefunded] = await Promise.all([
    paidOrders(),
    paidOrders().eq('status', 'refunded'),
    vouchers(),
    vouchers().not('redeemed_at', 'is', null),
    vouchers().eq('status', 'cancelled'),
    vouchers().eq('status', 'refunded'),
  ])

  // A failed count is reported as zero and logged, never as a confident
  // number: `loadRateCounts` feeding 0 into a denominator makes the rate null,
  // which renders as a dash. That is the honest outcome for a count that did
  // not happen.
  for (const [name, result] of [
    ['paid', paid],
    ['refunded', refunded],
    ['issued', issued],
    ['redeemed', redeemed],
    ['cancelled', cancelled],
    ['voucher_refunded', vRefunded],
  ] as const) {
    if (result.error)
      log.error('analytics.rate_count_failed', { count: name, reason: result.error.message })
  }

  return {
    paidOrders: paid.count ?? 0,
    refundedOrders: refunded.count ?? 0,
    vouchersIssued: issued.count ?? 0,
    vouchersRedeemed: redeemed.count ?? 0,
    vouchersCancelled: cancelled.count ?? 0,
    vouchersRefunded: vRefunded.count ?? 0,
  }
}

export type OpsLoad =
  | { available: true; vouchers: VoucherCounts; refunds: RefundCounts; standing: StandingCounts }
  | { available: false; reason: string }

/** A numeric shekel column as integer agorot, or -1 so the caller's sum skips it. */
function ilsColumnToAgorot(value: string | number | null): number {
  if (value === null) return 0
  try {
    return parseIls(typeof value === 'number' ? value.toFixed(2) : value)
  } catch {
    return -1
  }
}

/**
 * Redemption and refund counts for the window, for `computeOpsKpis`, plus the
 * two standing figures.
 *
 * Vouchers are counted by `created_at`, refunds by `requested_at`: both are
 * "what was opened in this window", which is the population the sales KPIs
 * on the same page describe. A voucher issued last month and redeemed today is
 * not in a 30-day redemption rate, on purpose: that rate answers "of what we
 * sold recently, how much has been used".
 *
 * Active vouchers and payouts due ignore the window. They are what is
 * outstanding now, and a tile that shrank when the admin picked "7 days"
 * would be reporting the filter, not the liability.
 *
 * Counts with `head: true` cost no rows, and PostgREST has no GROUP BY, so
 * this is several small reads rather than one aggregate.
 */
export async function loadOpsKpis(days: number, now: Date = new Date()): Promise<OpsLoad> {
  const admin = createAdminClient()
  const since = windowStart(days, now)

  const count = (status?: string[]) => {
    let q = admin
      .from('vouchers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
    if (status) q = q.in('status', status as never)
    return q
  }

  const [issued, redeemed, voided, refundRows, active, payouts] = await Promise.all([
    count(),
    count(['redeemed']),
    count(['cancelled', 'refunded']),
    admin.from('refunds').select('state, granted_agorot').gte('requested_at', since),
    admin
      .from('vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'issued' as never)
      .gt('expires_at', now.toISOString()),
    admin
      .from('payout_statements')
      .select('status, rolled_over, total_payout_ils')
      .in('status', [...PAYOUT_DUE_STATUSES] as never),
  ])

  const failed = [issued, redeemed, voided, refundRows, active, payouts].find((r) => r.error)
  if (failed?.error) {
    log.warn('analytics.ops_kpis_failed', { reason: failed.error.message })
    return { available: false, reason: failed.error.message }
  }

  let completed = 0
  let granted = 0
  for (const row of refundRows.data ?? []) {
    if (row.state !== 'completed') continue
    completed += 1
    granted += Number(row.granted_agorot ?? 0)
  }

  const due = sumPayoutsDue(
    (payouts.data ?? []).map((row) => ({
      status: row.status as string,
      amountAgorot: ilsColumnToAgorot(row.total_payout_ils as string | number | null),
    })),
  )

  return {
    available: true,
    vouchers: {
      issued: issued.count ?? 0,
      redeemed: redeemed.count ?? 0,
      voided: voided.count ?? 0,
    },
    refunds: {
      requested: (refundRows.data ?? []).length,
      completed,
      grantedAgorot: agorot(granted),
    },
    standing: {
      activeVouchers: active.count ?? 0,
      payoutsDue: due.count,
      payoutsDueAgorot: due.totalAgorot,
    },
  }
}
