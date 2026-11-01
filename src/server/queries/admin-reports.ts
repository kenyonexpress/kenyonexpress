import 'server-only'

import { log } from '@/lib/observability/log'
import {
  type PendingCohortRetentionRow,
  type PendingOrdersDailyRow,
  type PendingRevenueDailyRow,
  type PendingTopProductRow,
  callPendingReportRpc,
  pendingReportRpc,
} from '@/lib/supabase/pending-reports'
import { createClient } from '@/lib/supabase/server'

/**
 * Reads for the denormalized reporting tables (migration 170, pending).
 *
 * These go through the REQUEST-SCOPED client, not the service client the
 * settlement report uses: the RPCs are SECURITY DEFINER and check
 * public.is_admin() against the caller's JWT themselves, so the database is
 * the authority on who may read. `requireAdminSession` still runs in the page
 * before any of these, but a bug there fails closed here, not open.
 *
 * The numbers are a nightly snapshot rebuilt by pg_cron at 01:30 UTC; every
 * row carries the refreshed_at of its rebuild and the UI is expected to show
 * it. Live settlement numbers stay in src/server/queries/reports.ts. The two
 * answer different questions and neither replaces the other.
 */

/**
 * bigint arrives from PostgREST as a string once it exceeds 2^53 and as a
 * number below it, same trap `toAgorot` in reports.ts documents. Coerced here
 * so no string ever reaches a summing call site.
 */
function toAgorot(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

const NOT_INSTALLED = 'טבלאות הדוחות אינן מותקנות בבסיס הנתונים הזה: מיגרציה 170 עדיין לא הוחלה.'
const READ_FAILED = 'לא ניתן לקרוא את הדוח כרגע. נסה שוב.'

export type ReportWindowDays = 7 | 30 | 90

export interface RevenueDay {
  day: string
  ordersCount: number
  grossAgorot: number
  discountAgorot: number
  cashbackAppliedAgorot: number
  netAgorot: number
  refreshedAt: string
}

export interface OrdersDay {
  day: string
  totalOrders: number
  pendingCount: number
  paidCount: number
  cancelledCount: number
  refundedCount: number
  refreshedAt: string
}

export interface TopProduct {
  windowDays: number
  rank: number
  productId: string
  productNameHe: string | null
  supplierId: string | null
  unitsSold: number
  revenueAgorot: number
  refreshedAt: string
}

export interface CohortRetentionCell {
  cohortMonth: string
  monthOffset: number
  cohortSize: number
  activeUsers: number
  refreshedAt: string
}

export type AdminReportResult<T> =
  | { available: true; rows: T[] }
  | { available: false; reason: string }

async function runReport<Raw, Out>(
  rpcName: Parameters<typeof pendingReportRpc>[0],
  args: Record<string, unknown>,
  map: (row: Raw) => Out,
): Promise<AdminReportResult<Out>> {
  const supabase = await createClient()
  const result = await callPendingReportRpc<Raw>(() =>
    supabase.rpc(pendingReportRpc(rpcName), args as never),
  )

  if (!result.ok) {
    if (result.missing) {
      log.info('admin_reports.not_installed', { rpc: rpcName })
      return { available: false, reason: NOT_INSTALLED }
    }
    log.error('admin_reports.read_failed', { rpc: rpcName, reason: result.message })
    return { available: false, reason: READ_FAILED }
  }

  return { available: true, rows: result.rows.map(map) }
}

export async function getRevenueDaily(
  from?: string,
  to?: string,
): Promise<AdminReportResult<RevenueDay>> {
  return runReport<PendingRevenueDailyRow, RevenueDay>(
    'admin_report_revenue_daily',
    { p_from: from ?? null, p_to: to ?? null },
    (row) => ({
      day: row.day,
      ordersCount: row.orders_count,
      grossAgorot: toAgorot(row.gross_agorot),
      discountAgorot: toAgorot(row.discount_agorot),
      cashbackAppliedAgorot: toAgorot(row.cashback_applied_agorot),
      netAgorot: toAgorot(row.net_agorot),
      refreshedAt: row.refreshed_at,
    }),
  )
}

export async function getOrdersDaily(
  from?: string,
  to?: string,
): Promise<AdminReportResult<OrdersDay>> {
  return runReport<PendingOrdersDailyRow, OrdersDay>(
    'admin_report_orders_daily',
    { p_from: from ?? null, p_to: to ?? null },
    (row) => ({
      day: row.day,
      totalOrders: row.total_orders,
      pendingCount: row.pending_count,
      paidCount: row.paid_count,
      cancelledCount: row.cancelled_count,
      refundedCount: row.refunded_count,
      refreshedAt: row.refreshed_at,
    }),
  )
}

export async function getTopProducts(
  windowDays: ReportWindowDays = 30,
): Promise<AdminReportResult<TopProduct>> {
  return runReport<PendingTopProductRow, TopProduct>(
    'admin_report_top_products',
    { p_window_days: windowDays },
    (row) => ({
      windowDays: row.window_days,
      rank: row.rank,
      productId: row.product_id,
      productNameHe: row.product_name_he,
      supplierId: row.supplier_id,
      unitsSold: toAgorot(row.units_sold),
      revenueAgorot: toAgorot(row.revenue_agorot),
      refreshedAt: row.refreshed_at,
    }),
  )
}

export async function getCohortRetention(): Promise<AdminReportResult<CohortRetentionCell>> {
  return runReport<PendingCohortRetentionRow, CohortRetentionCell>(
    'admin_report_cohort_retention',
    {},
    (row) => ({
      cohortMonth: row.cohort_month,
      monthOffset: row.month_offset,
      cohortSize: row.cohort_size,
      activeUsers: row.active_users,
      refreshedAt: row.refreshed_at,
    }),
  )
}
