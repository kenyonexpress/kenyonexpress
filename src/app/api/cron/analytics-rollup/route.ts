import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Nightly analytics rollup (STEP 37): the four `report_*` tables the admin
 * reports read (`report_revenue_daily`, `report_orders_daily`,
 * `report_top_products`, `report_cohort_retention`) are rebuilt from `orders`
 * by `refresh_report_tables()`, a SECURITY DEFINER function EXECUTE-revoked
 * from anon and authenticated; only the service role and the admin wrapper
 * `admin_refresh_reports()` may call it.
 *
 * THE DATABASE ALREADY DOES THIS. Measured 2026-10-08: pg_cron job
 * `report_tables_nightly` runs `select public.refresh_report_tables()` at
 * 01:30 UTC and has 34 consecutive `succeeded` rows. This route is the
 * backstop for the day pg_cron is paused (a paused project, a restore, an
 * extension dropped by a migration), which nothing else would notice: the
 * reports would simply keep showing yesterday's refreshed_at with no error
 * anywhere. The route runs an hour later, at 02:30 UTC, with the other two
 * jobs on that slot.
 *
 * IDEMPOTENT AND CHEAP WHEN THE DATABASE WAS FIRST. The function truncates and
 * rebuilds four tables, so a second run is harmless but not free. Before
 * calling it the route reads the newest `refreshed_at`; a rollup younger than
 * `FRESH_WINDOW_MS` is reported as `skipped` with that timestamp, and the
 * rebuild only happens when pg_cron missed its slot. That also makes this
 * route the one place where "the rollup did not run last night" becomes a
 * log line (`analytics_rollup.refreshed` carries `stale_for_ms`).
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

/** A rollup younger than this is pg_cron's, and is not redone. */
export const FRESH_WINDOW_MS = 6 * 60 * 60 * 1000

async function newestRefresh(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ at: string | null; error: string | null }> {
  const { data, error } = await admin
    .from('report_revenue_daily')
    .select('refreshed_at')
    .order('refreshed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { at: null, error: error.message }
  return { at: data?.refreshed_at ?? null, error: null }
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()

  const before = await newestRefresh(admin)
  if (before.error) {
    log.error('analytics_rollup.read_failed', { reason: before.error })
    return NextResponse.json({ ok: false, error: before.error }, { status: 500 })
  }

  const beforeMs = before.at ? Date.parse(before.at) : Number.NaN
  if (Number.isFinite(beforeMs) && now - beforeMs < FRESH_WINDOW_MS) {
    return NextResponse.json({ ok: true, skipped: true, refreshedAt: before.at })
  }

  const { error } = await admin.rpc('refresh_report_tables')
  if (error) {
    log.error('analytics_rollup.refresh_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const after = await newestRefresh(admin)
  // An empty `report_revenue_daily` after a successful refresh is a shop with
  // no paid order yet, not a failure: the function wrote nothing to read.
  log.info('analytics_rollup.refreshed', {
    refreshedAt: after.at,
    staleForMs: Number.isFinite(beforeMs) ? now - beforeMs : null,
  })
  return NextResponse.json({ ok: true, skipped: false, refreshedAt: after.at })
}

export const GET = withRequestLog('/api/cron/analytics-rollup', handleGET)
