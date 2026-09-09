import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A SOFT-DELETED WISHLIST ROW CANNOT BE RESTORED BY ITS OWNER, AND IT CANNOT
 * BE RE-ADDED EITHER. THE WISHLIST IS A SHIPPED FEATURE, NOT A FUTURE ONE.
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
 * THE PREMISE THIS TEST WAS FILED UNDER WAS WRONG. It said "nothing writes
 * `wishlists` at all -- there is no `from('wishlists')` anywhere in src/",
 * and therefore that the feature did not exist and the finding was theory.
 * Measured 2026-09-09: `src/server/actions/wishlist.ts` (toggleWishlist and
 * its neighbours; they were in `reviews.ts` until the wishlist was finished
 * that evening), `src/server/queries/wishlist.ts`,
 * `src/app/(account)/account/wishlist/page.tsx`, the heart on every product
 * card and on the product page, a counter in both headers, a guest list in
 * `localStorage` merged at login, and two rate-limit policies all ship today.
 * The feature is live; only the soft delete is not reachable.
 *
 * WHAT IS ACTUALLY UNREACHABLE, AND WHAT HOLDS IT. No src/ file sets
 * `deleted_at` on `wishlists` -- the toggle removes with a hard DELETE -- so
 * no row can carry a `deleted_at` today, and production carries none. That
 * is the whole reason the dead restore is not a live customer bug, so it is
 * the thing worth guarding, and the second test below guards it by reading
 * src/ rather than by asserting it in prose. The previous version of this
 * file claimed it "goes red when someone starts writing wishlists" while
 * only ever reading a .sql file: a tripwire with no wire, and its trigger
 * condition had already happened.
 *
 * WHY THE RLS IS NOT REDESIGNED HERE. A restore path is a product decision
 * (a service-role un-delete, or an owner SELECT branch that can see its own
 * deleted rows and a list that then has to filter them). Nothing needs one
 * while nothing sets the column. The day the guard below goes red is the day
 * that decision has to be made, and it will be made against a reachable
 * failure instead of a hypothetical one.
 *
 * THE OBVIOUS ESCAPE HATCH IS ALSO CLOSED, and it is worth naming because it
 * is the first thing anyone tries: clear the tombstone with a hard DELETE and
 * insert a fresh row. Measured on production 2026-09-09, rolled back, as the
 * owner with the correct auth.uid():
 *
 *   DELETE ... WHERE product_id = <tombstoned> AND user_id = <own>   0 rows
 *
 * Postgres applies the SELECT policy to the rows a DELETE reads for its WHERE
 * clause, exactly as it does for UPDATE, so the filtered SELECT policy hides
 * the row from the delete as well. Under 185 as applied, a soft-deleted
 * wishlist row is reachable by the service role and by nothing else.
 *
 * THE CONSEQUENCE IF IT EVER IS REACHED, measured the same day, both runs
 * rolled back, as the owner:
 *
 *   soft-deleted row present      owner SELECT 0 rows, then INSERT 23505
 *   concurrent double-click       INSERT 23505, then re-read 1 row
 *
 * Same SQLSTATE, opposite truth. `runToggleWishlist` used to map every 23505
 * to `{ ok: true, saved: true }`, which would have filled the heart over a
 * list that stays empty. It now re-reads and only reports "saved" when the
 * row is actually visible; the third test below holds that.
 */

const MIGRATION = 'migrations/applied/185_soft_delete_user_facing_remainder.sql'
const SRC = resolve(process.cwd(), 'src')

function migration(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8')
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
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

  it('WISHLIST_SOFT_DELETE_UNREACHABLE: no src/ file sets deleted_at on wishlists', () => {
    // The guard the prose used to be. A file that both names the table and
    // writes the column is the one shape that can put a row into the state
    // 185 cannot get it out of. Red here means: pick a restore path.
    const offenders = sourceFiles(SRC).filter((path) => {
      const text = readFileSync(path, 'utf8')
      return text.includes("from('wishlists'") && /deleted_at\s*:/.test(text)
    })
    expect(offenders.map((p) => p.slice(SRC.length + 1))).toEqual([])
  })

  it('WISHLIST_23505_IS_NOT_PROOF_OF_SAVED: the toggle re-reads before claiming saved', () => {
    // 23505 is returned both by the double-click race and by a collision with
    // a hidden soft-deleted row. Only a re-read separates them, so the action
    // must not answer the error code alone.
    const action = readFileSync(resolve(SRC, 'server/actions/wishlist.ts'), 'utf8')
    const insertOnward = action.slice(action.indexOf('.insert({ user_id: user.id'))
    const untilReturn = insertOnward.slice(
      0,
      insertOnward.indexOf('return { ok: true, saved: true }'),
    )

    expect(untilReturn).toContain('.maybeSingle()')
    expect(untilReturn).toContain('reread == null')
  })
})
