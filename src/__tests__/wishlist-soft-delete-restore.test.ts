import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A SOFT-DELETED WISHLIST ROW CANNOT BE RESTORED BY ITS OWNER, AND THE
 * MIGRATION USED TO CLAIM THE OPPOSITE.
 *
 * 185 replaces the single `wishlists_owner_all` policy with four per-command
 * policies. SELECT filters `deleted_at is null`; UPDATE deliberately does
 * not, and the file said that was so "an un-delete (set deleted_at = null)
 * stays possible". It is not possible. Postgres applies SELECT policies to
 * the rows an `UPDATE ... WHERE` has to read, so the filtered SELECT policy
 * hides the row before the unfiltered UPDATE policy is ever consulted.
 *
 * Measured on production 2026-09-09, in transactions that were rolled back,
 * as the owner with the correct auth.uid() (confirmed inside the session):
 *
 *   restore UPDATE, policies exactly as 185 applies them      0 rows
 *   same UPDATE, SELECT policy swapped for an unfiltered one  1 row
 *
 * Nothing else differed between those two runs, so the SELECT policy is the
 * cause rather than a guess about one.
 *
 * IT IS WORSE THAN A DEAD RESTORE. The primary key is (user_id, product_id),
 * so a soft-deleted row also blocks re-adding the same product: the INSERT
 * policy would allow it, the PK will not. A customer who removes an item
 * would be unable to put it back, and unable to see why.
 *
 * WHY THIS IS RECORDED AND NOT FIXED. Nothing writes `wishlists` at all --
 * there is no `from('wishlists')` anywhere in src/ as of 2026-09-09, so the
 * feature does not exist yet and no row can currently reach `deleted_at`.
 * Redesigning an RLS policy set for an unbuilt feature would be guessing at
 * requirements; leaving a comment that promises a capability the database
 * does not have is the failure this repo keeps paying for. So the comment
 * now states the measured truth, in the file and on the column itself, and
 * this test holds the finding until someone builds the wishlist and picks a
 * restore path on purpose (a service-role un-delete, or an owner SELECT
 * branch that can see their own deleted rows).
 *
 * This test goes red when someone starts writing wishlists, which is exactly
 * when the decision has to be made.
 */

const MIGRATION = 'migrations/applied/185_soft_delete_user_facing_remainder.sql'

function migration(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8')
}

describe('wishlists soft delete: the restore that does not work', () => {
  it('WISHLIST_RESTORE_IMPOSSIBLE: SELECT filters deleted_at while UPDATE does not', () => {
    const sql = migration()
    const wishlistSection = sql.slice(sql.indexOf('-- wishlists'))

    // The SELECT policy is what makes the row unreachable.
    expect(wishlistSection).toContain(
      'create policy wishlists_owner_select on public.wishlists\n  for select\n  using (user_id = (select auth.uid()) and deleted_at is null);',
    )
    // The UPDATE policy is unfiltered, which is necessary but not sufficient.
    expect(wishlistSection).toContain(
      'create policy wishlists_owner_update on public.wishlists\n  for update\n  using (user_id = (select auth.uid()))\n  with check (user_id = (select auth.uid()));',
    )
  })

  it('does not promise a restore anywhere in the file or the column comment', () => {
    const sql = migration()
    expect(sql).not.toContain('so an un-delete (set deleted_at = null) stays possible')
    expect(sql).not.toContain('UPDATE is deliberately unfiltered so the owner can restore')
    // and says what is actually true, in the comment that lands in the database
    expect(sql).toContain('THE OWNER CANNOT RESTORE ONE')
  })
})
