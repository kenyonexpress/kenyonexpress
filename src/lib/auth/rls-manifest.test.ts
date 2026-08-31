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
 */

type ManifestTable = {
  table_name: string
  rls_enabled: boolean
  policy_count: number
}

type Manifest = {
  measured_at: string
  project_ref: string
  schema: string
  service_role_only: Record<string, string>
  tables: ManifestTable[]
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

describe('RLS manifest', () => {
  it('describes the production project, not a local stand-in', () => {
    expect(manifest.project_ref).toBe('ixvwfbuvfxxsjiywhbbb')
    expect(manifest.schema).toBe('public')
    expect(manifest.measured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is not empty or truncated', () => {
    // 53 at the 2026-08-19 measurement. The floor exists so a botched paste
    // that drops most of the file cannot pass by having nothing to check.
    expect(manifest.tables.length).toBeGreaterThanOrEqual(50)
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

  it('does not exempt a table that actually has policies', () => {
    // A stale exemption is worse than none: it says "deny-by-default" about a
    // table that has since been opened up.
    const byName = new Map(manifest.tables.map((t) => [t.table_name, t]))
    for (const [name] of serviceRoleOnly) {
      const row = byName.get(name)
      expect(row, `service_role_only names ${name}, which is not in tables`).toBeDefined()
      expect(row?.policy_count, `${name} now has policies; drop the exemption`).toBe(0)
    }
  })
})
