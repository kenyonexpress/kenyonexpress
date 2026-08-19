import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Which tables can be WRITTEN through PostgREST, and under what predicate.
 *
 * WHY THIS IS NOT COVERED BY rls-manifest.test.ts. That manifest carries a
 * policy COUNT per table, which answers "is this table locked down at all" and
 * nothing more. A count of three is the same number whether those three
 * policies are `is_admin()` or `true`, and it is the same number whether they
 * are SELECT or DELETE. The questions this project actually turns on are the
 * ones a count cannot reach:
 *
 *   - can a supplier rewrite who performed a redemption, after the fact?
 *   - can anyone rewrite `order_items`, where platform_percent is snapshotted
 *     at purchase and is supposed to be immutable from that moment?
 *   - is the audit log append-only, or merely called one?
 *
 * WHAT WAS MEASURED AND HOW. `pg_policies` on the hosted project, every row
 * whose `cmd` is not SELECT, with its `qual` and `with_check` verbatim. Same
 * standing constraint as the count manifest: CI has no database, so what is
 * committed is a measurement plus the rules it has to satisfy, and re-measuring
 * is `node scripts/check-rls.mjs --sql-writes`.
 *
 * THE RESULT, RECORDED HERE BECAUSE IT IS THE POINT. `voucher_redemptions`,
 * `vouchers`, `payments`, `payment_webhook_events` and `split_executions` carry
 * NO non-SELECT policy at all. With RLS on, Postgres therefore denies every
 * INSERT, UPDATE and DELETE from `anon` and `authenticated` alike: those tables
 * are reachable for writing only through the service role or a SECURITY
 * DEFINER function. The redemption trail is immutable to the till that wrote
 * it, which is what the comment in the redeem route has always claimed and
 * what nothing until now checked.
 */

type WritePolicy = {
  tablename: string
  policyname: string
  cmd: string
  qual: string
  with_check: string
}

type Manifest = {
  tables: { table_name: string }[]
  write_policies: {
    $measured_at: string
    no_write_policy: string[]
    policies: WritePolicy[]
  }
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/rls-manifest.json'), 'utf8'),
) as Manifest

const writes = manifest.write_policies
const tableNames = new Set(manifest.tables.map((t) => t.table_name))

/** A predicate that grants the command to everyone the policy applies to. */
function isUnconditioned(predicate: string): boolean {
  const p = predicate.trim().toLowerCase()
  return p === 'true' || p === '(true)'
}

/** The predicate a command is actually judged by: USING for reads/deletes,
 *  WITH CHECK for the rows an INSERT or UPDATE tries to write. */
function predicatesOf(policy: WritePolicy): string[] {
  return [policy.qual, policy.with_check].filter((p) => p.length > 0)
}

describe('the write side of RLS', () => {
  it('was measured, and says when', () => {
    expect(writes.$measured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(writes.policies.length).toBeGreaterThan(0)
  })

  it('accounts for every table exactly once', () => {
    // A table that is in neither list is one nobody looked at. A table in both
    // is a measurement that contradicts itself.
    const withPolicies = new Set(writes.policies.map((p) => p.tablename))
    const declaredClosed = new Set(writes.no_write_policy)
    for (const table of tableNames) {
      const inOne = withPolicies.has(table) !== declaredClosed.has(table)
      expect(inOne, `${table} is in both lists or in neither`).toBe(true)
    }
    expect(withPolicies.size + declaredClosed.size).toBe(tableNames.size)
  })

  it('names no table that does not exist', () => {
    for (const policy of writes.policies) {
      expect(tableNames, `policy on unknown table ${policy.tablename}`).toContain(policy.tablename)
    }
    for (const table of writes.no_write_policy) {
      expect(tableNames, `no_write_policy names unknown table ${table}`).toContain(table)
    }
  })

  it.each(writes.policies.map((p) => [`${p.tablename}.${p.policyname} (${p.cmd})`, p] as const))(
    '%s is guarded by a predicate',
    (_label, policy) => {
      // A write policy with no predicate at all, or with `true`, grants the
      // command to every role it names. There is no such policy in production
      // today and this is what keeps it that way.
      const predicates = predicatesOf(policy)
      expect(predicates, `${policy.policyname} has neither USING nor WITH CHECK`).not.toHaveLength(
        0,
      )
      for (const predicate of predicates) {
        expect(
          isUnconditioned(predicate),
          `${policy.policyname} is unconditioned: ${predicate}`,
        ).toBe(false)
      }
    },
  )

  describe('the tables whose whole value is that they cannot be rewritten', () => {
    /**
     * Each of these is append-only or immutable by design, and each has code
     * that says so in a comment. The entry is the reason; the assertion is that
     * production still agrees.
     */
    const IMMUTABLE_TO_THE_API: Record<string, string> = {
      voucher_redemptions:
        'the scan audit trail. A till that could UPDATE this could rewrite who redeemed a voucher after the fact, which is the one thing the trail exists to prevent. src/app/api/supplier/vouchers/redeem/route.ts stamps staff_id through the service role for exactly this reason.',
      vouchers:
        'redemption is decided by redeem_voucher() inside one conditional UPDATE. A client-side UPDATE path would be a second way to burn or un-burn a voucher, outside that predicate.',
      payments:
        'what we believe was charged. Written by the webhook and by finalize, both service role. A client write here would desynchronise us from the terminal, which is precisely what the reconciliation cron exists to detect.',
      payment_webhook_events:
        'the dedup journal. Its UNIQUE constraint is what makes a Cardcom replay a no-op; a client that could DELETE a row could make one charge finalize twice.',
      split_executions: 'the executed money split, per order item. Immutable once written.',
      escrow_holds:
        'abolished model, two historical rows. Nothing may write here again, by any path.',
    }

    it.each(Object.entries(IMMUTABLE_TO_THE_API))('%s has no write policy at all', (table) => {
      expect(tableNames, `${table} is not in the manifest`).toContain(table)
      const found = writes.policies.filter((p) => p.tablename === table)
      expect(
        found.map((p) => `${p.cmd} ${p.policyname}`),
        `${table} gained a write policy. RLS on with none is the tightest state available; adding one opens a path that did not exist.`,
      ).toEqual([])
      expect(writes.no_write_policy).toContain(table)
    })

    it('every reason is a sentence somebody wrote, not a placeholder', () => {
      for (const [table, reason] of Object.entries(IMMUTABLE_TO_THE_API)) {
        expect(reason.length, `${table} needs a real reason`).toBeGreaterThan(40)
      }
    })
  })

  describe('audit_log, which is closed the other way', () => {
    it('refuses insert, update and delete with a policy that says false', () => {
      // Not "no policy" but "a policy that can never match". Same outcome
      // through PostgREST, and it survives someone later adding a permissive
      // policy, because Postgres ORs permissive policies together — so this is
      // worth asserting as the specific shape it is.
      const policies = writes.policies.filter((p) => p.tablename === 'audit_log')
      expect(policies.map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'UPDATE'])
      for (const policy of policies) {
        for (const predicate of predicatesOf(policy)) {
          expect(predicate.trim().toLowerCase(), `${policy.policyname}`).toBe('false')
        }
      }
    })
  })

  describe('the money tables that DO allow writes', () => {
    /** Admin-gated, deliberately: an operator has to be able to fix a bad row. */
    const ADMIN_ONLY = ['order_items', 'orders', 'wallet_transactions', 'wallet_balances']

    it.each(ADMIN_ONLY)('%s is writable only behind is_admin()', (table) => {
      const policies = writes.policies.filter((p) => p.tablename === table)
      expect(policies.length, `${table} has no write policies to check`).toBeGreaterThan(0)
      for (const policy of policies) {
        for (const predicate of predicatesOf(policy)) {
          expect(
            predicate.includes('is_admin()'),
            `${table}.${policy.policyname} is not admin-gated: ${predicate}`,
          ).toBe(true)
        }
      }
    })
  })
})
