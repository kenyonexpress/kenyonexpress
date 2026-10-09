/**
 * The reporting RPCs migration 170 adds, typed here because they are not in
 * `src/types/database.ts` yet.
 *
 * Same pattern and same deletion point as pending-schema.ts (135): the
 * shapes live HERE, next to the one cast that names them, instead of leaking
 * `as never` through the call sites or hand-editing the generated file.
 *
 * 170 WAS applied to production on 2026-09-04 (MCP, `reporting_tables_170`),
 * so the RPCs exist and work there at runtime. What has NOT happened is a
 * regeneration of `database.ts`: that file is generated from the whole
 * schema at once, and regenerating it also pulls in 169's audit changes and
 * anything other sessions applied, a ripple this goal does not own.
 *
 * WHEN database.ts IS REGENERATED: delete this file and call
 * `supabase.rpc(...)` directly in `src/server/queries/admin-reports.ts`.
 * The column names here are the column names in the migration.
 *
 * Until then every caller must still assume the call can fail with "function
 * does not exist" (a local or preview database without 170) and render an
 * honest "not installed" state, not an empty chart. `isMissingReportSchema`
 * below is that check.
 */

/** Row of public.report_revenue_daily, as admin_report_revenue_daily returns it. */
export interface PendingRevenueDailyRow {
  day: string
  orders_count: number
  /** bigint: arrives as number below 2^53 and as string above it. */
  gross_agorot: number | string
  discount_agorot: number | string
  cashback_applied_agorot: number | string
  net_agorot: number | string
  refreshed_at: string
}

/** Row of public.report_orders_daily. */
export interface PendingOrdersDailyRow {
  day: string
  total_orders: number
  pending_count: number
  paid_count: number
  cancelled_count: number
  refunded_count: number
  refreshed_at: string
}

/** Row of public.report_top_products. */
export interface PendingTopProductRow {
  window_days: number
  rank: number
  product_id: string
  product_name_he: string | null
  supplier_id: string | null
  units_sold: number | string
  revenue_agorot: number | string
  refreshed_at: string
}

/** Row of public.report_cohort_retention. */
export interface PendingCohortRetentionRow {
  cohort_month: string
  month_offset: number
  cohort_size: number
  active_users: number
  refreshed_at: string
}

export type PendingReportRpcName =
  | 'admin_report_revenue_daily'
  | 'admin_report_orders_daily'
  | 'admin_report_top_products'
  | 'admin_report_cohort_retention'
  | 'admin_refresh_reports'

/**
 * Names an RPC the generated types do not have, for `.rpc()`.
 *
 * The cast is confined to this one expression, exactly the way
 * `pendingTable` in pending-schema.ts confines the table-name cast.
 */
export function pendingReportRpc(name: PendingReportRpcName): never {
  return name as never
}

/**
 * Runs an RPC that may not exist yet and types its rows.
 *
 * Returns `{ missing: true }` rather than throwing when the function is
 * absent, so the caller decides what an un-migrated database looks like on
 * its surface. Any other error is returned as-is for the caller to surface.
 */
export async function callPendingReportRpc<Row>(
  run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<
  | { ok: true; rows: Row[] }
  | { ok: false; missing: true }
  | { ok: false; missing: false; message: string }
> {
  const { data, error } = await run()

  if (error) {
    if (isMissingReportSchema(error)) return { ok: false, missing: true }
    return { ok: false, missing: false, message: error.message ?? 'unknown error' }
  }

  const rows = Array.isArray(data) ? (data as Row[]) : data == null ? [] : [data as Row]
  return { ok: true, rows }
}

/**
 * Whether a PostgREST error is "migration 170 has not been applied" rather
 * than a real failure.
 *
 * 42883 is Postgres's undefined_function and PGRST202 is PostgREST's "could
 * not find the function in the schema cache"; which one surfaces depends on
 * whether the schema cache has been reloaded. 42P01 covers the half-applied
 * case where the function exists but a report table does not.
 *
 * Distinguishing this from a general error matters for the same reason it
 * does in pending-schema.ts: "the reports are not installed" and "the reports
 * failed to load" must not look alike on an admin screen whose entire job is
 * to be believed.
 */
export function isMissingReportSchema(
  error: {
    code?: string
    message?: string
  } | null,
): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202' || error.code === '42P01') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    (message.includes('admin_report_') ||
      message.includes('admin_refresh_reports') ||
      message.includes('report_')) &&
    (message.includes('does not exist') || message.includes('schema cache'))
  )
}
