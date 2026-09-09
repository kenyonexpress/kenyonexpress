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
 * profile. Account deletion anonymizes: `fn_anonymize_user` (150) DELETEs five
 * satellite tables and UPDATEs `profiles`, and `account.ts` then calls
 * `deleteUser(id, true)` -- the `true` is Supabase's shouldSoftDelete, and the
 * comment beside it says the soft delete is load-bearing because auth.users
 * cascades to profiles and a hard delete would orphan every order. So the
 * cascade path is unreachable while that stays true.
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
const ACCOUNT_ACTIONS = 'src/server/actions/account.ts'

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
    const account = read(ACCOUNT_ACTIONS)

    // `true` is shouldSoftDelete. Flip it to a hard delete and the cascade in
    // the test above becomes the error a deleting customer sees.
    expect(account).toContain('deleteUser(plan.userId, true)')

    // The erasure is an UPDATE on profiles, not a DELETE. If a
    // `.from('profiles').delete()` ever appears on this path, the guard is
    // live and this expectation is the warning.
    expect(account).not.toMatch(/from\('profiles'\)[\s\S]{0,80}\.delete\(\)/)
  })
})
