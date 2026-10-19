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
 * "must have policies" -- it is "if a client cannot touch it, say in writing
 * why".
 *
 * THE SHAPE OF THAT LOCK CHANGED ON 2026-09-07 and the test changed with it.
 * Migration 122 gave seven of the eight zero-policy tables an explicit
 * RESTRICTIVE `deny_all_client_roles` (ALL commands, anon+authenticated, USING
 * false, WITH CHECK false), so their policy count went 0 -> 1 while they became
 * no less locked. The old rule -- "an exempt table must have exactly zero
 * policies" -- would now fail on all seven and would be pushing toward removing
 * the deny. So the manifest records the LOCK (`no_policies` or
 * `deny_all_client_roles`) and this file checks that instead of a count.
 *
 * `payment_webhook_events` left the list in the same measurement, and that one
 * is a real change rather than a restatement: it now carries a PERMISSIVE
 * SELECT for `authenticated` where `is_admin()`, so an admin can read the
 * webhook journal.
 */

type ManifestTable = {
  table_name: string
  rls_enabled: boolean
  policy_count: number
}

type ClientLock = { lock: 'no_policies' | 'deny_all_client_roles'; reason: string }

type Manifest = {
  measured_at: string
  project_ref: string
  schema: string
  /** Superseded by client_locked; kept as a pointer, see the manifest. */
  service_role_only: Record<string, unknown>
  client_locked: Record<string, ClientLock | unknown>
  tables: ManifestTable[]
}

function loadManifest(): Manifest {
  const raw = readFileSync(resolve(process.cwd(), 'supabase/rls-manifest.json'), 'utf8')
  return JSON.parse(raw) as Manifest
}

const manifest = loadManifest()
const clientLocked = Object.entries(manifest.client_locked).filter(
  ([key]) => !key.startsWith('$'),
) as [string, ClientLock][]
const clientLockedNames = new Set(clientLocked.map(([name]) => name))

describe('RLS manifest', () => {
  it('describes the production project, not a local stand-in', () => {
    expect(manifest.project_ref).toBe('ixvwfbuvfxxsjiywhbbb')
    expect(manifest.schema).toBe('public')
    expect(manifest.measured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is not empty or truncated', () => {
    // 53 at the 2026-08-19 measurement, 71 at the 2026-09-07 one. The floor
    // exists so a botched paste that drops most of the file cannot pass by
    // having nothing to check.
    expect(manifest.tables.length).toBeGreaterThanOrEqual(70)
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
      .filter((t) => t.policy_count === 0 && !clientLockedNames.has(t.table_name))
      .map((t) => t.table_name)
    expect(
      undocumented,
      'RLS on with no policies denies everyone, which is fine — but say so in client_locked',
    ).toEqual([])
  })

  it('gives a real reason for each client-locked table', () => {
    for (const [name, entry] of clientLocked) {
      expect(entry.reason.length, `${name} needs a reason, not a placeholder`).toBeGreaterThan(20)
    }
  })

  it('records a lock that matches the policy count it was measured with', () => {
    // The two ways to be locked look different in the catalogue, and conflating
    // them is how a real opening hides: `no_policies` must still be zero, and
    // `deny_all_client_roles` must have at least the deny itself.
    const byName = new Map(manifest.tables.map((t) => [t.table_name, t]))
    for (const [name, entry] of clientLocked) {
      const row = byName.get(name)
      expect(row, `client_locked names ${name}, which is not in tables`).toBeDefined()
      if (entry.lock === 'no_policies') {
        expect(row?.policy_count, `${name} is listed as having no policies`).toBe(0)
      } else {
        expect(entry.lock, `${name} has an unknown lock`).toBe('deny_all_client_roles')
        expect(
          row?.policy_count ?? 0,
          `${name} is listed as denied by policy, so it must have one`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('leaves no stale service_role_only list behind', () => {
    // The key was superseded on 2026-09-07. An old reader must find the note,
    // not a list that stopped being true.
    const stale = Object.keys(manifest.service_role_only).filter((k) => !k.startsWith('$'))
    expect(stale, 'service_role_only is superseded by client_locked').toEqual([])
  })
})
