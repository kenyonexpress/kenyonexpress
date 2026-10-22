#!/usr/bin/env node
/**
 * MAINTENANCE_LOOP_9: connection-pool and query-performance probe through the
 * official Supabase MCP server (@supabase/mcp-server-supabase), driven over
 * stdio in --read-only mode. The claude.ai Supabase connector needs an OAuth
 * flow only Ofir can finish, so the same server is run as a child process with
 * the CLI's keychain token instead.
 *
 *   TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
 *   SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d) \
 *     node scripts/db-mcp-probe.mjs > logs/maint9/result.json
 *
 * Output: one JSON document with every probe's rows plus the performance
 * advisors. `summarize()` turns it into the numbers docs/DB-STATUS.md quotes.
 *
 * Measured traps (2026-10-20):
 * - pg_stat_statements lives in the `extensions` schema on Supabase; the bare
 *   name is 42P01.
 * - execute_sql answers {"result": "<prose> <untrusted-data-ID> boundaries.
 *   \n\n<untrusted-data-ID>\n<rows json>\n</untrusted-data-ID> ..."}: the prose
 *   names the tag before the data does, so the parser anchors on the tag that
 *   is followed by a newline, not the first occurrence.
 * - with --project-ref on the command line every tool rejects a project_id
 *   argument.
 */
import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import { createInterface } from 'node:readline'

export const PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'
export const SLOW_MS = 500

const PGSS = 'extensions.pg_stat_statements'

export const PROBES = {
  settings: `select name, setting, unit from pg_settings where name in ('max_connections','superuser_reserved_connections','statement_timeout','idle_in_transaction_session_timeout','shared_buffers','work_mem','server_version') order by name`,
  activity: `select state, wait_event_type, count(*)::int as n, max(extract(epoch from (now()-state_change)))::int as max_age_s from pg_stat_activity where backend_type='client backend' group by 1,2 order by 3 desc`,
  activity_by_app: `select coalesce(application_name,'') as app, usename, count(*)::int as n from pg_stat_activity where backend_type='client backend' group by 1,2 order by 3 desc limit 20`,
  activity_total: `select count(*)::int as backends, (select setting::int from pg_settings where name='max_connections') as max_connections, (select setting::int from pg_settings where name='superuser_reserved_connections') as reserved from pg_stat_activity where backend_type='client backend'`,
  long_running: `select pid, usename, state, extract(epoch from (now()-query_start))::int as age_s, left(query,160) as query from pg_stat_activity where backend_type='client backend' and state<>'idle' and query_start < now() - interval '${SLOW_MS} milliseconds' and pid<>pg_backend_pid() order by query_start limit 20`,
  database: `select datname, numbackends, xact_commit, xact_rollback, deadlocks, temp_files, round(100.0*blks_hit/nullif(blks_hit+blks_read,0),2) as cache_hit_pct, stats_reset from pg_stat_database where datname='postgres'`,
  locks: 'select count(*)::int as waiting from pg_locks where not granted',
  pgss_present: `select extname, extversion from pg_extension where extname='pg_stat_statements'`,
  pgss_reset: 'select stats_reset from extensions.pg_stat_statements_info',
  pgss_summary: `select count(*)::int as statements, sum(calls)::bigint as calls, round(sum(total_exec_time)::numeric,0) as total_ms, count(*) filter (where mean_exec_time>${SLOW_MS})::int as over_500_mean, count(*) filter (where max_exec_time>${SLOW_MS})::int as over_500_max from ${PGSS}`,
  slow_mean: `select calls, round(mean_exec_time::numeric,1) as mean_ms, round(max_exec_time::numeric,1) as max_ms, round(total_exec_time::numeric,0) as total_ms, rows, left(query,400) as query from ${PGSS} where mean_exec_time > ${SLOW_MS} and query not ilike '%pg_stat_statements%' order by mean_exec_time desc limit 25`,
  slow_max: `select calls, round(mean_exec_time::numeric,1) as mean_ms, round(max_exec_time::numeric,1) as max_ms, round(stddev_exec_time::numeric,1) as stddev_ms, left(query,420) as query from ${PGSS} where max_exec_time > ${SLOW_MS} and mean_exec_time <= ${SLOW_MS} and query not ilike '%pg_stat_statements%' order by max_exec_time desc limit 25`,
  top_total: `select calls, round(mean_exec_time::numeric,1) as mean_ms, round(total_exec_time::numeric,0) as total_ms, left(query,160) as query from ${PGSS} where query not ilike '%pg_stat_statements%' order by total_exec_time desc limit 15`,
  top_calls: `select calls, round(mean_exec_time::numeric,1) as mean_ms, left(query,160) as query from ${PGSS} where query not ilike '%pg_stat_statements%' order by calls desc limit 10`,
  temp_spill: `select calls, round(mean_exec_time::numeric,1) as mean_ms, temp_blks_written, pg_size_pretty(temp_blks_written*8192) as temp_written, left(query,160) as query from ${PGSS} where temp_blks_written > 0 order by temp_blks_written desc limit 10`,
  seq_scans:
    'select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup from pg_stat_user_tables where seq_scan > 0 and n_live_tup > 1000 order by seq_tup_read desc limit 10',
  unused_indexes:
    'select s.relname as table, s.indexrelname as index, s.idx_scan, pg_size_pretty(pg_relation_size(s.indexrelid)) as size from pg_stat_user_indexes s join pg_index i on i.indexrelid=s.indexrelid where s.idx_scan=0 and not i.indisunique and not i.indisprimary order by pg_relation_size(s.indexrelid) desc limit 15',
  replication_slots:
    'select slot_name, plugin, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) as lag from pg_replication_slots',
  table_sizes:
    'select relname, n_live_tup, n_dead_tup, pg_size_pretty(pg_total_relation_size(relid)) as total, last_autovacuum::date as last_autovacuum from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 10',
  db_size: `select pg_size_pretty(pg_database_size('postgres')) as size`,
}

/**
 * Extract the rows from an MCP tools/call response. Returns an array for a
 * successful execute_sql, the parsed object for other tools, `{ error }` for a
 * JSON-RPC error and `{ raw }` when the body is not JSON.
 */
export function unwrapMcpResult(msg) {
  if (msg.error) return { error: msg.error }
  let text = msg.result?.content?.[0]?.text ?? ''
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && typeof parsed.result === 'string') {
      text = parsed.result
    } else if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch {
    // plain text: fall through to the boundary scan
  }
  const m = text.match(/<untrusted-data-([a-f0-9-]+)>\n([\s\S]*?)\n<\/untrusted-data-\1>/)
  const body = m ? m[2] : text
  try {
    return JSON.parse(body)
  } catch {
    return { raw: body }
  }
}

/**
 * Who issued a pg_stat_statements row. PostgREST wraps every application
 * statement in `WITH pgrst_source AS (...)`; the Supabase dashboard, pg-meta,
 * the Realtime poller and our own management-API probes are platform traffic
 * that no application change can speed up.
 */
export function classifyStatement(query) {
  const q = String(query)
  if (q.startsWith('WITH pgrst_source') || q.includes('"public".')) return 'app'
  if (q.includes('wal->>')) return 'realtime'
  // pg-meta's listings are long CTEs; within the first 400 chars they show
  // relrowsecurity / nspname / arg_modes before any pg_* catalogue name.
  if (
    /pg_stat_|information_schema|pg_class|pg_namespace|pg_timezone_names|pg_available_extensions|pg_proc|pg_type|pg_backup|pg_temp\.|relrowsecurity|nspname|arg_modes/.test(
      q,
    )
  ) {
    return 'platform'
  }
  return 'other'
}

/** The numbers DB-STATUS.md quotes, from a probe document. */
export function summarize(doc) {
  const first = (k) => (Array.isArray(doc.probes[k]) ? doc.probes[k][0] : undefined)
  const rows = (k) => (Array.isArray(doc.probes[k]) ? doc.probes[k] : [])
  const total = first('activity_total') ?? {}
  const setting = (name) => rows('settings').find((r) => r.name === name)?.setting
  const slowMean = rows('slow_mean').map((r) => ({ ...r, who: classifyStatement(r.query) }))
  const slowMax = rows('slow_max').map((r) => ({ ...r, who: classifyStatement(r.query) }))
  const appSlowMean = slowMean.filter((r) => r.who === 'app')
  const appSpikes = slowMax.filter((r) => r.who === 'app')
  // get_advisors answers {"result": {"lints": [...]}} with an object, not a string, inside.
  const adv = doc.advisors_performance ?? {}
  const lints = adv.lints ?? adv.result?.lints ?? []
  return {
    pool: {
      backends: total.backends ?? null,
      maxConnections: total.max_connections ?? null,
      reserved: total.reserved ?? null,
      utilisationPct:
        total.backends != null && total.max_connections
          ? Math.round((1000 * total.backends) / total.max_connections) / 10
          : null,
      waitingLocks: first('locks')?.waiting ?? null,
      longRunning: rows('long_running').length,
      statementTimeoutMs: setting('statement_timeout'),
      idleInTxTimeoutMs: setting('idle_in_transaction_session_timeout'),
      byApp: rows('activity_by_app'),
    },
    statements: {
      ...(first('pgss_summary') ?? {}),
      since: first('pgss_reset')?.stats_reset ?? null,
      slowMean,
      slowMax,
      appSlowMean,
      appSpikes,
    },
    alert: appSlowMean.length > 0,
    advisors: lints.map((l) => ({ name: l.name, level: l.level, count: l.count })),
  }
}

function startServer() {
  const child = spawn(
    'npx',
    ['-y', '@supabase/mcp-server-supabase@latest', '--read-only', `--project-ref=${PROJECT_REF}`],
    { stdio: ['pipe', 'pipe', 'inherit'], env: process.env },
  )
  const pending = new Map()
  let nextId = 1
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const send = (method, params, notify = false) => {
    const id = notify ? undefined : nextId++
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    if (notify) return Promise.resolve()
    return new Promise((resolve) => pending.set(id, resolve))
  }
  return { child, send }
}

async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error('SUPABASE_ACCESS_TOKEN is required (see the header comment)')
    process.exit(2)
  }
  const { child, send } = startServer()
  const out = { ts: new Date().toISOString(), projectRef: PROJECT_REF, probes: {} }
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'db-mcp-probe', version: '1' },
  })
  await send('notifications/initialized', {}, true)
  const tools = await send('tools/list', {})
  out.tools = (tools.result?.tools ?? []).map((t) => t.name)
  for (const [key, query] of Object.entries(PROBES)) {
    out.probes[key] = unwrapMcpResult(
      await send('tools/call', { name: 'execute_sql', arguments: { query } }),
    )
  }
  out.advisors_performance = unwrapMcpResult(
    await send('tools/call', { name: 'get_advisors', arguments: { type: 'performance' } }),
  )
  out.summary = summarize(out)
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
  child.kill()
  const s = out.summary
  console.error(
    `pool ${s.pool.backends}/${s.pool.maxConnections} (${s.pool.utilisationPct}%), ` +
      `statements over ${SLOW_MS}ms by mean: ${s.statements.slowMean.length} ` +
      `(app: ${s.statements.appSlowMean.length}), app spikes: ${s.statements.appSpikes.length}`,
  )
  process.exit(0)
}

if (process.argv[1] && basename(process.argv[1]) === 'db-mcp-probe.mjs') {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
