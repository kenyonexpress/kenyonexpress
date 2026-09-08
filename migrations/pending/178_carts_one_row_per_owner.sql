-- 178_carts_one_row_per_owner.sql
--
-- NOT APPLIED. Run preflight_178.sql first.
--
-- ONE CART PER OWNER, ENFORCED WHERE IT CAN ACTUALLY BE ENFORCED.
--
-- `src/server/actions/cart.ts` reads the shopper's cart with `.maybeSingle()`,
-- on `profile_id` when signed in and on `(session_id, profile_id IS NULL)` when
-- not. postgrest-js synthesises PGRST116 when such a filter matches MORE than
-- one row. The file carries a long comment about what that cost the first time
-- (2026-08-20): the error was discarded, so it read as "this account has no
-- cart", the cart showed empty on every request, and every write, seeing no
-- existing id, inserted yet another row.
--
-- The application side of that is already fixed. `cartRowOrFail` deliberately
-- does NOT use `orFail`, because `orFail` exempts PGRST116 as "a .single()
-- found no row" -- right for the catalogue, exactly wrong here, where PGRST116
-- can only mean duplicates. It throws instead.
--
-- WHAT IS STILL MISSING IS THE CONSTRAINT. Measured against production
-- 2026-09-08: `carts` carries four indexes and not one of them is unique
-- except the primary key on `id`.
--
--   carts_pkey            UNIQUE (id)
--   carts_profile_id_idx  (profile_id)          -- not unique
--   carts_session_id_idx  (session_id)          -- not unique
--   idx_carts_expires_at  (expires_at)          -- not unique
--
-- So the second row can still be created. The code turns the consequence from
-- silent corruption into a loud error, which is the right order to fix these
-- in, but a shopper whose cart has two rows still has a broken cart until
-- somebody deletes one by hand. This makes the second row impossible instead.
--
-- WHY THIS IS SAFE TO APPLY TODAY, measured rather than assumed:
--   2129 cart rows, and ZERO duplicate groups on either arm.
--   All 2129 are guest rows (session_id set, profile_id null); no row has
--   both set, and no row has neither.
-- The unique build therefore has nothing to reject. If that has changed by the
-- time somebody applies this, the CREATE fails and the whole transaction rolls
-- back, which is the outcome to want: it means real duplicates exist and need
-- a decision, not a silent merge chosen by a migration.
--
-- WHY NOT `CONCURRENTLY`. It cannot run inside a transaction block, and the
-- house style here is one atomic BEGIN/COMMIT per migration. A plain
-- CREATE INDEX takes SHARE on `carts`, blocking writes for the build only; at
-- 2129 rows that is milliseconds. Revisit if this table ever gets large.
--
-- WHY THE PREDICATES ARE PARTIAL, and matched to the two reads:
--   profile arm  WHERE profile_id IS NOT NULL   -- 2129 guest rows are exempt
--   guest arm    WHERE profile_id IS NULL       -- mirrors `.is('profile_id',
--                                                  null)` exactly
-- A cart that has been merged onto an account carries both columns, and the
-- guest arm must not constrain it: after the merge it is no longer reachable
-- by the guest read.
--
-- RELATIONSHIP TO 170. `170_composite_indexes_top_queries.sql` adds a
-- NON-unique `carts_session_profile_idx (session_id, profile_id)` for the same
-- guest lookup. The two coexist, and the unique partial index below serves that
-- read on its own. Whoever applies both may drop entry (9) from 170 afterwards;
-- 170 is not edited here, because it has already been audited against
-- production and re-auditing it to save one index is the worse trade.

BEGIN;

-- A signed-in shopper has at most one cart.
CREATE UNIQUE INDEX IF NOT EXISTS carts_one_per_profile_uniq
  ON public.carts (profile_id)
  WHERE profile_id IS NOT NULL;

-- A guest session has at most one cart. Scoped to rows the guest read can
-- actually return, so a merged cart is out of scope by construction.
CREATE UNIQUE INDEX IF NOT EXISTS carts_one_per_guest_session_uniq
  ON public.carts (session_id)
  WHERE profile_id IS NULL AND session_id IS NOT NULL;

COMMIT;

-- ROLLBACK
--   DROP INDEX IF EXISTS public.carts_one_per_profile_uniq;
--   DROP INDEX IF EXISTS public.carts_one_per_guest_session_uniq;
-- Dropping either is free and loses nothing but the guarantee: the reads above
-- are still served by carts_profile_id_idx and carts_session_id_idx.
