import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the invariants migration 170 promises, the same way
 * audit-coverage.test.ts pins 169. The file was verified end-to-end against
 * production inside a rolled-back transaction on 2026-09-04 and then applied
 * the same day (MCP, `reporting_tables_170`); this test keeps the checked-in
 * copy honest as the record of what production got, so an edit that drops a
 * gate or a revoke fails a test instead of rewriting history quietly.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'migrations/pending/170_reporting_tables.sql'),
  'utf8',
)

/** Every function 170 creates. */
const FUNCTIONS = [
  'refresh_report_tables',
  'admin_report_revenue_daily',
  'admin_report_orders_daily',
  'admin_report_top_products',
  'admin_report_cohort_retention',
  'admin_refresh_reports',
]

/** Every table 170 creates. */
const TABLES = [
  'report_revenue_daily',
  'report_orders_daily',
  'report_top_products',
  'report_cohort_retention',
]

function bodyOf(fn: string): string {
  // Function bodies are $$-quoted; take from the CREATE to the next $$; pair.
  const start = MIGRATION.indexOf(`create or replace function public.${fn}(`)
  expect(start, `${fn} is created`).toBeGreaterThan(-1)
  const end = MIGRATION.indexOf('$$;', start)
  return MIGRATION.slice(start, end)
}

describe('migration 170', () => {
  it('creates all four tables idempotently, with RLS enabled and client grants revoked', () => {
    for (const table of TABLES) {
      expect(MIGRATION).toContain(`create table if not exists public.${table}`)
      expect(MIGRATION).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      )
      expect(MIGRATION).toMatch(new RegExp(`revoke all on public\\.${table}\\s+from anon`))
    }
  })

  it('gates every admin RPC on is_admin() before its first read', () => {
    for (const fn of FUNCTIONS.filter((name) => name.startsWith('admin_'))) {
      const body = bodyOf(fn)
      expect(body, `${fn} checks is_admin`).toContain('if not public.is_admin() then')
      expect(body, `${fn} refuses with 42501`).toContain("errcode = '42501'")
    }
  })

  it('pins every definer function to an empty search_path', () => {
    for (const fn of FUNCTIONS) {
      const body = bodyOf(fn)
      expect(body, `${fn} is security definer`).toContain('security definer')
      expect(body, `${fn} pins search_path`).toContain("set search_path = ''")
    }
  })

  it('keeps the internal refresh out of client reach and grants only the admin RPCs', () => {
    expect(MIGRATION).toContain(
      'revoke all on function public.refresh_report_tables() from public, anon, authenticated;',
    )
    // The nightly job runs as the scheduling role, not as a client role, so
    // refresh_report_tables must never appear in a grant to authenticated.
    expect(MIGRATION).not.toMatch(/grant execute on function public\.refresh_report_tables/)
    for (const fn of FUNCTIONS.filter((name) => name.startsWith('admin_'))) {
      expect(MIGRATION).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to authenticated;`),
      )
    }
  })

  it('schedules the nightly pg_cron job, guarded and idempotent', () => {
    expect(MIGRATION).toContain("if exists (select 1 from pg_extension where extname = 'pg_cron')")
    expect(MIGRATION).toContain("cron.unschedule('report_tables_nightly')")
    expect(MIGRATION).toMatch(
      /cron\.schedule\(\s*'report_tables_nightly',\s*'30 1 \* \* \*',\s*'select public\.refresh_report_tables\(\)'/,
    )
  })

  it('keeps money integer: every money column is bigint and reads *_agorot sources', () => {
    // Table definitions: no numeric/float money columns.
    for (const line of MIGRATION.split('\n')) {
      if (/agorot\s+(numeric|real|double|float)/i.test(line)) {
        throw new Error(`float money column: ${line.trim()}`)
      }
    }
    for (const column of [
      'subtotal_ils_agorot',
      'discount_ils_agorot',
      'cashback_applied_ils_agorot',
      'total_ils_agorot',
      'total_price_ils_agorot',
    ]) {
      expect(MIGRATION, `reads ${column}`).toContain(column)
    }
    // The non-agorot ils columns must not be summed anywhere in this file.
    expect(MIGRATION).not.toMatch(/sum\(o\.total_ils\)/)
    expect(MIGRATION).not.toMatch(/sum\(oi\.total_price_ils\)/)
  })

  it('buckets by Israel days, not UTC midnights', () => {
    expect(MIGRATION).toContain("at time zone 'Asia/Jerusalem'")
    expect(MIGRATION).not.toMatch(/::date\s*--\s*utc/i)
  })

  it('counts revenue only for paid-lineage, undeleted orders', () => {
    const body = bodyOf('refresh_report_tables')
    expect(body).toContain('o.paid_at is not null')
    expect(body).toContain('o.deleted_at is null')
    for (const status of ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled']) {
      expect(body).toContain(`'${status}'::public.order_status`)
    }
    expect(body).toContain("'cancelled'::public.order_item_status")
    expect(body).toContain("'refunded'::public.order_item_status")
  })

  it('carries the rollback for everything it creates', () => {
    for (const table of TABLES) {
      expect(MIGRATION).toContain(`drop table if exists public.${table};`)
    }
    for (const fn of FUNCTIONS) {
      expect(MIGRATION).toMatch(new RegExp(`drop function if exists public\\.${fn}\\(`))
    }
    expect(MIGRATION).toContain("cron.unschedule('report_tables_nightly');")
  })
})
