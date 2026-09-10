import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * RLS is on for every table in `public`, and every table without policies is
 * one we meant to lock shut.
 *
 * WHY A MANIFEST AND NOT A LIVE QUERY. CI has no database. There is no local
 * Postgres either -- `docs/DB-HARDENING-AUDIT.md` records that the from-zero
 * reset is not runnable here, and `supabase/migrations/` describes a different
 * lineage than production, so replaying the file chain would test a schema
 * nobody runs. What CI can hold honestly is a MEASURED snapshot plus the rules
 * that snapshot has to satisfy. Re-measuring is `node scripts/check-rls.mjs`.
 *
 * WHAT THIS ACTUALLY CATCHES. Someone re-measures after adding a table, pastes
 * the new rows in, and the new table arrives with `rls_enabled: false` or with
 * zero policies and no entry in `service_role_only`. Both fail here. It does
 * NOT catch drift that nobody re-measured -- no offline test can -- which is
 * why the manifest carries the date it was taken.
 *
 * WHY ZERO POLICIES IS NOT A FAILURE BY ITSELF. Postgres denies every row when
 * RLS is on and no policy matches. A table with RLS and no policies is the
 * tightest state available, not the loosest, and the advisor's
 * `rls_enabled_no_policy` INFO would have us loosen it. So the rule here is not
 * "must have policies" -- it is "if it has none, say in writing why".
 *
 * AND WHY A COUNT OF ONE IS NOW ALSO NOT A FAILURE. Between the 2026-08-19 and
 * 2026-09-09 measurements the eight locked tables went from zero policies to
 * one apiece: `deny_all_client_roles`, ALL commands, `false` on both USING and
 * WITH CHECK. Nothing was opened up -- the denial that used to be inferred from
 * an absence is now stated where `pg_policies` shows it. The old rule read that
 * as "it has policies, drop the exemption" and would have had us delete the
 * write-down of the tightest tables in the schema.
 *
 * A COUNT CANNOT TELL THOSE TWO APART. One policy saying `false` and one policy
 * saying `true` are both one policy. So this file no longer judges an exempt
 * table by its count: it looks the policies up in `write_policies`, which
 * carries the predicates verbatim, and demands that every last one of them be
 * the deny-all shape -- RESTRICTIVE included, for the reason under isDenyAll.
 */

type ManifestTable = {
  table_name: string
  rls_enabled: boolean
  policy_count: number
}

type WritePolicy = {
  tablename: string
  policyname: string
  cmd: string
  permissive: string
  qual: string
  with_check: string
}

type Manifest = {
  measured_at: string
  project_ref: string
  schema: string
  service_role_only: Record<string, string>
  tables: ManifestTable[]
  write_policies: { policies: WritePolicy[]; no_write_policy: string[] }
  client_dml_grants: {
    intended: Record<string, string>
    column_grants: Record<string, string>
    surplus_tables: string[]
    surplus_views: string[]
    revoked_by: string
  }
}

function loadManifest(): Manifest {
  const raw = readFileSync(resolve(process.cwd(), 'supabase/rls-manifest.json'), 'utf8')
  return JSON.parse(raw) as Manifest
}

const manifest = loadManifest()
const serviceRoleOnly = Object.entries(manifest.service_role_only).filter(
  ([key]) => !key.startsWith('$'),
)
const serviceRoleOnlyNames = new Set(serviceRoleOnly.map(([name]) => name))

/** `false`, however Postgres chose to parenthesise it. */
function saysFalse(predicate: string | undefined): boolean {
  return (
    (predicate ?? '')
      .trim()
      .toLowerCase()
      .replace(/^\(|\)$/g, '') === 'false'
  )
}

/**
 * Every command, every client role, denied on both sides, RESTRICTIVE.
 *
 * The RESTRICTIVE part is the half worth stating. Postgres ORs permissive
 * policies together and ANDs restrictive ones onto the result, so a PERMISSIVE
 * policy saying `false` contributes nothing to the OR and stops mattering the
 * instant somebody adds a second permissive policy for a legitimate read. A
 * RESTRICTIVE `false` cannot be outvoted by anything added later.
 *
 * So the move from zero policies to this shape was a strengthening and not a
 * restatement: zero policies is undefeatable too, but only until the first
 * permissive policy lands, and the reason a policy lands on a table like this
 * is usually somebody clearing the advisor's rls_enabled_no_policy INFO.
 */
function isDenyAll(policy: WritePolicy): boolean {
  return (
    policy.cmd === 'ALL' &&
    policy.permissive === 'RESTRICTIVE' &&
    saysFalse(policy.qual) &&
    saysFalse(policy.with_check)
  )
}

const writePoliciesByTable = new Map<string, WritePolicy[]>()
for (const policy of manifest.write_policies.policies) {
  const list = writePoliciesByTable.get(policy.tablename) ?? []
  list.push(policy)
  writePoliciesByTable.set(policy.tablename, list)
}

describe('RLS manifest', () => {
  it('describes the production project, not a local stand-in', () => {
    expect(manifest.project_ref).toBe('ixvwfbuvfxxsjiywhbbb')
    expect(manifest.schema).toBe('public')
    expect(manifest.measured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is not empty or truncated', () => {
    // 53 at the 2026-08-19 measurement, 81 at the 2026-09-09 one. The floor
    // exists so a botched paste that drops most of the file cannot pass by
    // having nothing to check, and it is raised with each measurement because
    // a floor left at the old number stops catching anything.
    expect(manifest.tables.length).toBeGreaterThanOrEqual(78)
  })

  it('names each table once', () => {
    const names = manifest.tables.map((t) => t.table_name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('has RLS enabled on every table', () => {
    const unprotected = manifest.tables.filter((t) => !t.rls_enabled).map((t) => t.table_name)
    expect(unprotected, 'tables in public with RLS off').toEqual([])
  })

  it('explains every table that has no policies', () => {
    const undocumented = manifest.tables
      .filter((t) => t.policy_count === 0 && !serviceRoleOnlyNames.has(t.table_name))
      .map((t) => t.table_name)
    expect(
      undocumented,
      'RLS on with no policies denies everyone, which is fine — but say so in service_role_only',
    ).toEqual([])
  })

  it('gives a real reason for each service-role-only table', () => {
    for (const [name, reason] of serviceRoleOnly) {
      expect(reason.length, `${name} needs a reason, not a placeholder`).toBeGreaterThan(20)
    }
  })

  it('does not exempt a table that has been opened up', () => {
    // A stale exemption is worse than none: it says "deny-by-default" about a
    // table that has since been opened up. What counts as opened up is any
    // policy that is not the deny-all shape -- the count on its own says
    // nothing, because `false` and `true` are both one policy.
    const byName = new Map(manifest.tables.map((t) => [t.table_name, t]))
    for (const [name] of serviceRoleOnly) {
      const row = byName.get(name)
      expect(row, `service_role_only names ${name}, which is not in tables`).toBeDefined()
      if (row?.policy_count === 0) continue

      const policies = writePoliciesByTable.get(name) ?? []
      const openings = policies.filter((p) => !isDenyAll(p)).map((p) => p.policyname)
      expect(openings, `${name} carries a policy that is not deny-all`).toEqual([])
      expect(
        policies.length,
        `${name} has ${row?.policy_count} policies but write_policies knows ${policies.length}; a SELECT policy would not appear there, so re-measure before trusting this`,
      ).toBe(row?.policy_count)
    }
  })

  it('holds the deny-all tables to the predicate, not to a count', () => {
    // The regression this exists for: someone reads "1 policy" as "it has a
    // policy now" and swaps the deny-all for a real one. Named tables rather
    // than a loop over the list, so deleting an entry from service_role_only
    // does not delete the check along with it.
    for (const name of ['settlement_events', 'rate_limits', 'user_rate_limits']) {
      const policies = writePoliciesByTable.get(name) ?? []
      expect(policies.length, `${name} lost its deny-all policy`).toBeGreaterThan(0)
      for (const policy of policies) {
        expect(isDenyAll(policy), `${name}.${policy.policyname} is not deny-all`).toBe(true)
      }
    }
  })
})

/**
 * THE GRANT SIDE, ADDED 2026-09-10.
 *
 * Everything above is about policies: which ROWS a role may write. A grant is
 * the question underneath it - whether the role may write at all - and until
 * this block existed nothing in the repository recorded it.
 * `docs/SECURITY-POSTURE.md` §4 calls it the one structural gap and recommends
 * one thing: re-apply the DML revoke on the money tables. Measured against
 * production on 2026-09-10, `authenticated` held INSERT on 74 relations, UPDATE
 * on 72 and DELETE on 72, up from the 56 recorded on 09-01, because Supabase's
 * default privileges hand the client roles everything on every new table.
 *
 * 114 of those privileges - three each on 38 relations - are unusable: those
 * relations have no permissive client write policy, and Postgres refuses the
 * write before it looks at a grant. Proven on production the same day, inside a
 * DO block that revoked all 114, asserted none survived, and then raised to roll
 * itself back: `privileges before=114, remaining after revoke=none, carts anon
 * INSERT=t, notifications.read_at UPDATE=t`.
 *
 * WHAT THIS TEST HOLDS, WITH NO DATABASE. That the ledger and the migration that
 * acts on it cannot drift apart, and that the revoke list never quietly loses a
 * money table. It cannot re-measure production; the date on the block is what
 * says when somebody last did.
 */
const grants = manifest.client_dml_grants
const noWritePolicy = new Set(manifest.write_policies.no_write_policy)
const migration = readFileSync(
  resolve(process.cwd(), 'migrations/pending/230_revoke_surplus_client_dml.sql'),
  'utf8',
)

describe('client DML grants', () => {
  it('revokes nothing that a client write policy depends on', () => {
    // The failure this prevents: a table gains a legitimate client write policy,
    // and the revoke in 230 - written when it had none - takes the feature out
    // at apply time, in production, with the policy sitting there looking right.
    const contradictory = grants.surplus_tables.filter((table) => !noWritePolicy.has(table))
    expect(
      contradictory,
      'on the revoke list but carrying a client write policy -- remove it from surplus_tables and from migration 230',
    ).toEqual([])
  })

  it('names in migration 230 exactly the relations the ledger names', () => {
    const revoked = [
      ...migration.matchAll(/^REVOKE INSERT, UPDATE, DELETE ON public\.([a-z0-9_]+) FROM/gm),
    ].map((match) => match[1])

    expect(new Set(revoked).size, 'a relation revoked twice').toBe(revoked.length)
    expect([...revoked].sort()).toEqual([...grants.surplus_tables, ...grants.surplus_views].sort())
  })

  it('keeps every money-path relation on the revoke list', () => {
    // A ratchet, not a restatement. Shortening the list is the change worth
    // catching: each of these is a table where one permissive policy written by
    // accident would be a live vulnerability for exactly as long as the grant
    // underneath it survives.
    const money = [
      'cashback_ledger',
      'escrow_holds',
      'invoices',
      'payment_events',
      'payments',
      'refunds',
      'split_executions',
      'subscription_charges',
      'voucher_redemptions',
      'vouchers',
      'wallet_accounts',
      'wallet_balances',
      'wallet_entries',
      'wallet_transactions',
    ]
    const listed = new Set(grants.surplus_tables)
    expect(money.filter((table) => !listed.has(table))).toEqual([])
  })

  it('leaves the two shapes that must survive out of the revoke list', () => {
    const targets = new Set([...grants.surplus_tables, ...grants.surplus_views])

    // Guest carts: anon writes them by design, and it is the only relation where
    // a client role should hold DML and does.
    expect(Object.keys(grants.intended)).toContain('carts')
    expect(targets.has('carts')).toBe(false)

    // Column grants are a narrower privilege than the table grant this revokes,
    // and a table-level REVOKE on the same relation would read as covering them.
    for (const qualified of Object.keys(grants.column_grants)) {
      const named = qualified
        .split(',')
        .map((part) => part.trim().split('.')[0] ?? '')
        .filter(Boolean)
      for (const table of named) {
        expect(targets.has(table), `${table} carries a column grant and must not be revoked`).toBe(
          false,
        )
      }
    }
  })

  it('says when it was measured', () => {
    expect(grants.revoked_by).toBe('migrations/pending/230_revoke_surplus_client_dml.sql')
    expect((grants as unknown as Record<string, string>).$measured_at).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })
})
