import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'
import { slowQueryMs } from '@/lib/supabase/query-log-fetch'

/**
 * The database's own slow-query log, sampled into the structured stream.
 *
 * TWO MEASUREMENTS OF "SLOW", AND WHY BOTH EXIST. query-log-fetch.ts times
 * every Supabase round trip from inside the Node process and warns
 * `db.query_slow` past SUPABASE_SLOW_QUERY_MS (300ms). That number includes
 * the network, PostgREST and the timeout layer, and it is attributed to a
 * request id, which is what makes it actionable from a shopper's complaint.
 * What it cannot see is a statement that is slow without being ours: a
 * trigger body, a pg_cron job, PostgREST's schema-cache reload, a dashboard
 * introspection. Postgres measures all of those in pg_stat_statements, by
 * statement and by executing role, and that is what this reads.
 *
 * WHY NOT log_min_duration_statement. Measured and ruled out on production
 * on 2026-10-07: the parameter is superuser-context and Supabase's `postgres`
 * holds no SET grant on it (migration 255 quotes the probe). pg_stat_statements
 * is readable, so the slow-query log is a nightly sample of it rather than a
 * server log line per statement -- which also means it lands in the same
 * Axiom dataset, under the same 30-day retention, next to `db.query_slow`.
 *
 * WHY ONE THRESHOLD. `slowQueryMs` is the one knob: the per-request warn and
 * the sampling floor cannot drift apart, so a line in either place means the
 * same thing. The report is cumulative (pg_stat_statements is since the last
 * reset), which is why it runs nightly and not on the five-minute health
 * tick: the same twenty rows every five minutes would be a bill, not a log.
 *
 * UNTIL MIGRATION 255 IS APPLIED the RPC does not exist. PostgREST answers
 * PGRST202, this logs it once per run at info and reports `skipped`; the
 * cron route answers 200 and nothing pages, because an unapplied migration
 * is a known state, not an incident.
 */

export type SlowStatement = {
  queryid: string
  role: string | null
  calls: number
  mean_exec_ms: number
  max_exec_ms: number
  total_exec_ms: number
  rows_per_call: number
  query: string
}

export type SlowStatementsReport =
  | { status: 'reported'; thresholdMs: number; count: number; statements: SlowStatement[] }
  | { status: 'skipped'; reason: 'rpc_missing' }
  | { status: 'failed'; reason: string }

/** PostgREST: the function is not in the schema cache (migration not applied). */
const FUNCTION_MISSING = 'PGRST202'

/** Rows per run. The function caps at 100; 20 is what a person reads. */
export const DEFAULT_LIMIT = 20

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Tolerant of the wire: a bigint comes back as a string or a number depending
 * on the driver's choice, and a row with a missing field is dropped rather
 * than logged as `undefined`.
 */
function normalizeRow(raw: unknown): SlowStatement | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const num = (value: unknown): number | null => {
    const parsed = typeof value === 'string' ? Number(value) : value
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
  }
  const calls = num(row.calls)
  const mean = num(row.mean_exec_ms)
  const max = num(row.max_exec_ms)
  const total = num(row.total_exec_ms)
  const rowsPerCall = num(row.rows_per_call)
  if (
    calls === null ||
    mean === null ||
    max === null ||
    total === null ||
    rowsPerCall === null ||
    typeof row.query !== 'string'
  ) {
    return null
  }
  return {
    queryid: String(row.queryid ?? ''),
    role: typeof row.role === 'string' ? row.role : null,
    calls,
    mean_exec_ms: mean,
    max_exec_ms: max,
    total_exec_ms: total,
    rows_per_call: rowsPerCall,
    query: row.query,
  }
}

export function normalizeSlowStatements(data: unknown): SlowStatement[] {
  if (!Array.isArray(data)) return []
  return data.map(normalizeRow).filter((row): row is SlowStatement => row !== null)
}

/**
 * Reads the slow statements and writes one `db.slow_statement` warn line per
 * row, plus a `db.slow_statements_sampled` summary. Never throws: the caller
 * is a cron route whose answer should describe what happened, not 500 on it.
 */
export async function reportSlowStatements(
  admin: AdminClient,
  env: NodeJS.ProcessEnv = process.env,
  options: { limit?: number } = {},
): Promise<SlowStatementsReport> {
  const thresholdMs = slowQueryMs(env)
  const limit = options.limit ?? DEFAULT_LIMIT

  let data: unknown
  let error: { code?: string; message: string } | null
  try {
    // `as never`: fn_slow_statements arrives with pending migration 255 and
    // is not in the generated types until `pnpm db:types` runs after it.
    const result = await admin.rpc(
      'fn_slow_statements' as never,
      { p_threshold_ms: thresholdMs, p_limit: limit } as never,
    )
    data = result.data as unknown
    error = result.error as { code?: string; message: string } | null
  } catch (caught) {
    error = { message: caught instanceof Error ? caught.message : String(caught) }
  }

  if (error) {
    if (error.code === FUNCTION_MISSING) {
      log.info('db.slow_statements_unavailable', {
        reason: 'fn_slow_statements is not in the schema cache; migration 255 is pending',
      })
      return { status: 'skipped', reason: 'rpc_missing' }
    }
    log.error('db.slow_statements_read_failed', { reason: error.message, code: error.code })
    return { status: 'failed', reason: error.message }
  }

  const statements = normalizeSlowStatements(data)
  for (const statement of statements) {
    log.warn('db.slow_statement', {
      queryid: statement.queryid,
      role: statement.role,
      calls: statement.calls,
      mean_exec_ms: statement.mean_exec_ms,
      max_exec_ms: statement.max_exec_ms,
      total_exec_ms: statement.total_exec_ms,
      rows_per_call: statement.rows_per_call,
      threshold_ms: thresholdMs,
      query: statement.query,
    })
  }
  log.info('db.slow_statements_sampled', {
    threshold_ms: thresholdMs,
    limit,
    count: statements.length,
  })

  return { status: 'reported', thresholdMs, count: statements.length, statements }
}
