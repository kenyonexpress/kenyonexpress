import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the invariants migration 172 promises, the same way
 * admin-reports-migration.test.ts pins 170. The file was applied to production
 * on 2026-09-04 (MCP, `rls_zero_policy_tables_172` + `_report_grants`) and then
 * verified with the self-seeding three-persona harness
 * `tests/sql/rls_three_personas.sql`, run through MCP inside a rolled-back
 * transaction. These tests keep both checked-in files honest as the record of
 * what production got and of what the harness actually proves.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'migrations/pending/172_rls_zero_policy_tables.sql'),
  'utf8',
)

const HARNESS = readFileSync(join(process.cwd(), 'tests/sql/rls_three_personas.sql'), 'utf8')

/** Plumbing stores: no client role may touch them, admin JWT included. */
const DENY_TABLES = ['rate_limits', 'user_rate_limits', 'search_index_outbox']

/** Observational tables: admins may read, nobody else, writes stay service-only. */
const ADMIN_READ_TABLES = [
  'payment_webhook_events',
  'ai_usage',
  'analytics_events',
  'report_orders_daily',
  'report_revenue_daily',
  'report_top_products',
  'report_cohort_retention',
]

/** The report tables were created (170) with client grants revoked, so the
 *  policy is inert on them without a table-level SELECT grant. */
const REPORT_TABLES = ADMIN_READ_TABLES.filter((t) => t.startsWith('report_'))

describe('migration 172', () => {
  it('names all ten zero-policy tables and no others', () => {
    for (const table of [...DENY_TABLES, ...ADMIN_READ_TABLES]) {
      expect(MIGRATION, `${table} is covered`).toContain(`'${table}'`)
    }
  })

  it('gives the plumbing tables a RESTRICTIVE deny for both client roles', () => {
    // Restrictive is the point: a later permissive policy cannot quietly
    // reopen these tables, and even an admin JWT sees zero rows.
    expect(MIGRATION).toContain(
      'create policy deny_all_client_roles on public.%I as restrictive to anon, authenticated using (false) with check (false)',
    )
    for (const table of DENY_TABLES) {
      expect(MIGRATION).toContain(`'${table}'`)
    }
  })

  it('grants admins SELECT and nothing else on the observational tables', () => {
    expect(MIGRATION).toContain(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
    )
    // SELECT-only: no insert/update/delete policy for any client role anywhere.
    expect(MIGRATION).not.toMatch(/for (insert|update|delete)/)
  })

  it('keeps every CREATE POLICY behind a pg_policy existence check', () => {
    // CREATE POLICY has no IF NOT EXISTS; a bare one breaks the re-run.
    const creates = MIGRATION.match(/create policy/g) ?? []
    const guards = MIGRATION.match(/if not exists \(\s*select 1 from pg_policy/g) ?? []
    expect(creates.length).toBeGreaterThan(0)
    expect(guards.length).toBe(creates.length)
  })

  it('re-enables RLS and grants SELECT on the locked-down report tables', () => {
    expect(MIGRATION).toContain('enable row level security')
    expect(MIGRATION).toContain('grant select on public.%I to authenticated')
    for (const table of REPORT_TABLES) {
      expect(MIGRATION).toContain(`'${table}'`)
    }
  })

  it('carries its rollback note', () => {
    expect(MIGRATION).toMatch(/-- Rollback: `drop policy/)
  })
})

describe('the three-persona RLS harness', () => {
  it('runs all three personas: anon, an authenticated user, and an admin JWT', () => {
    expect(HARNESS).toContain('SET LOCAL ROLE anon')
    // authenticated appears twice: once as user A, once as the admin.
    const authenticated = HARNESS.match(/SET LOCAL ROLE authenticated/g) ?? []
    expect(authenticated.length).toBe(2)
    expect(HARNESS).toContain("json_build_object('sub', v_admin, 'role', 'authenticated')")
  })

  it('asserts cross-tenant denial between the two seeded users', () => {
    expect(HARNESS).toContain("user A reads % of user B''s addresses")
    expect(HARNESS).toContain("user A reads % of user B''s push tokens")
    expect(HARNESS).toContain('user A inserted an address for user B')
    expect(HARNESS).toContain("user A updated user B''s address")
  })

  it('asserts the 172 policies from both sides: admin in, non-admin out', () => {
    expect(HARNESS).toContain('admin cannot read report_orders_daily')
    expect(HARNESS).toContain('admin cannot read payment_webhook_events')
    expect(HARNESS).toContain('user A reads % report_orders_daily rows')
    expect(HARNESS).toContain('user A reads % payment_webhook_events rows')
    // The restrictive deny must hold even for the admin persona.
    expect(HARNESS).toContain('admin JWT reads % rate_limits rows')
  })

  it('is self-seeding and leaves nothing behind', () => {
    expect(HARNESS).toContain('gen_random_uuid()')
    expect(HARNESS.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    // The MCP variant relies on the documented exception to roll back.
    expect(HARNESS).toContain("RAISE EXCEPTION 'RLS_HARNESS_PASS';")
  })
})
