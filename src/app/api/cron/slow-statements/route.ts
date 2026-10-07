import { reportSlowStatements } from '@/lib/observability/slow-statements'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The nightly slow-statement report (STEP 28).
 *
 * Reads `fn_slow_statements` (migration 255) at SUPABASE_SLOW_QUERY_MS, the
 * same 300ms floor the per-request `db.query_slow` warn uses, and writes one
 * `db.slow_statement` line per row into the structured log stream, so the
 * database's own measurement sits in the same Axiom dataset, under the same
 * 30-day retention, as the application's. The reasoning, including why this
 * is a sample of pg_stat_statements and not log_min_duration_statement, is
 * in lib/observability/slow-statements.ts.
 *
 * NIGHTLY, NOT ON THE HEALTH TICK. pg_stat_statements is cumulative, so the
 * same rows would repeat every five minutes; once a day is a report, every
 * five minutes is a bill.
 *
 * ANSWERS 200 ON "SKIPPED". Until 255 is applied the function is missing and
 * the report says so; that is a known state recorded in migrations/pending,
 * not a failure the scheduler should go red on. A real read failure is 500,
 * which the scheduler does report.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const report = await reportSlowStatements(createAdminClient())
  const ok = report.status !== 'failed'

  return NextResponse.json(
    { ok, ...report },
    { status: ok ? 200 : 500, headers: { 'cache-control': 'no-store' } },
  )
}

export const GET = withRequestLog('/api/cron/slow-statements', handleGET)
