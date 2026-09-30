import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `cashback_ledger` DECLARES A CASCADE IT ALSO REFUSES TO PERFORM.
 *
 * Migration 177 gives the table `user_id uuid NOT NULL REFERENCES
 * public.profiles(id) ON DELETE CASCADE`, and in the same file a
 * `BEFORE UPDATE OR DELETE` trigger whose whole body is
 * `RAISE EXCEPTION 'cashback_ledger is append-only'`. Those two contradict
 * each other. A referential cascade fires the child table's row triggers, so
 * the guard raises and the PARENT delete fails -- the FK promises "my rows go
 * when the profile goes" while the trigger guarantees the profile can never
 * go. Measured on production before 177 was applied, with a throwaway
 * parent/child model rather than reasoned about:
 *
 *   DELETE parent (ON DELETE CASCADE)   -> RAISED: guard fired on DELETE
 *   DELETE order  (ON DELETE SET NULL)  -> RAISED: guard fired on UPDATE
 *
 * The SET NULL half is the same defect wearing different clothes: `order_id`,
 * `wallet_entry_id` and `created_by` are all ON DELETE SET NULL, and a SET
 * NULL is an UPDATE, which the guard also refuses. So deleting an ORDER that
 * has a cashback row would fail with "cashback_ledger is append-only", which
 * names neither the order nor the reason.
 *
 * WHY IT IS A GUN ON THE WALL AND NOT A FIRE, TODAY. Nothing hard-deletes a
 * profile. Account deletion anonymizes: `runAnonymizationCascade` in
 * lib/account/deletion.ts purges preference rows, scrubs `profiles` in place
 * with an UPDATE, lists `cashback_ledger` under RETAINED_FOR_LAW, and ends
 * the login with `updateUserById(..., { ban_duration })` rather than any
 * `deleteUser` -- its header says why: auth.users cascades to profiles and a
 * hard delete would either fail on the RESTRICT constraints or take the money
 * ledger with it. (A second path in account.ts used `deleteUser(id, true)`,
 * Supabase's soft delete, until STEP 11 removed it as a duplicate; this test
 * followed the surviving path.) So the cascade is unreachable while that
 * stays true.
 *
 * `audit_log` already carries the identical contradiction (`actor_id ->
 * auth.users ON DELETE SET NULL` under `tg_audit_log_append_only`, whose only
 * exemption is a year-old ip_address redaction), so this is the house pattern
 * rather than a mistake unique to 177. That is the argument for recording the
 * shape once, here, instead of quietly "fixing" a money table's FK.
 *
 * WHAT THIS TEST IS FOR. It asserts the contradiction EXISTS and that the one
 * thing making it harmless is still in place. It goes red the day somebody
 * switches account deletion to a hard delete, which is exactly the day the
 * cascade stops being theoretical and account deletion starts returning
 * "cashback_ledger is append-only" to a customer exercising a legal right.
 */

const LEDGER_SQL = 'migrations/applied/177_cashback_ledger.sql'
const DELETION = 'src/lib/account/deletion.ts'

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('cashback_ledger: cascade meets append-only', () => {
  it('CASCADE_MEETS_APPEND_ONLY: the FK and the guard still contradict each other', () => {
    const sql = read(LEDGER_SQL)

    // The cascade the guard will refuse to honour.
    expect(sql).toMatch(
      /user_id\s+uuid\s+NOT NULL REFERENCES public\.profiles\(id\) ON DELETE CASCADE/,
    )

    // The SET NULL columns, each of which reaches the guard as an UPDATE.
    for (const column of ['order_id', 'wallet_entry_id', 'created_by']) {
      expect(sql).toContain(`${column} `)
    }
    expect(sql.match(/ON DELETE SET NULL/g)).toHaveLength(3)

    // The guard itself: both verbs, unconditional raise.
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.cashback_ledger')
    expect(sql).toContain('cashback_ledger is append-only')
  })

  it('is unreachable only because account deletion never hard-deletes a profile', () => {
    // Comments stripped: the header mentions `deleteUser` by name to explain
    // why it is not called, and only code should satisfy or fail this.
    const code = read(DELETION)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    // The login ends by ban, not by deleting the auth user. Switch this to
    // `auth.admin.deleteUser` and the cascade in the test above becomes the
    // error a deleting customer sees.
    expect(code).toContain('ban_duration: DELETION_BAN_DURATION')
    expect(code).not.toContain('deleteUser(')

    // The erasure is an UPDATE on profiles, not a DELETE. If a
    // `.from('profiles').delete()` ever appears on this path, the guard is
    // live and this expectation is the warning.
    expect(code).toMatch(/from\('profiles'\)[\s\S]{0,40}\.update\(/)
    expect(code).not.toMatch(/from\('profiles'\)[\s\S]{0,80}\.delete\(\)/)

    // And the ledger itself is on the list the cascade refuses to touch.
    expect(code).toMatch(/RETAINED_FOR_LAW[\s\S]*'cashback_ledger'/)
  })
})
