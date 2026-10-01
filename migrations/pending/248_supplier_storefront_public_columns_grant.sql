-- 248_supplier_storefront_public_columns_grant.sql
--
-- Q32 (final-queue, 2026-10-01): the public supplier page (`/s/[id]`) shows
-- opening hours and a Google reviews link.
--
-- WHY A SEPARATE FILE AND NOT A LINE IN 232 OR 242. Both those files already
-- add the columns this grants -- `suppliers.opening_hours` (232) and
-- `suppliers.google_reviews_url` (242) -- but neither grants `anon` SELECT on
-- them, because neither reader at the time was the anon client. 242 says so
-- explicitly: "suppliers is read through the service client, so no grant is
-- added", which was true for the product page's `loadSupplierPublicContact`
-- (admin client, bypasses RLS) but is not true here. `loadSupplierStorefront`
-- (src/lib/supplier-storefront.ts) reads `suppliers` with `createPublicClient()`
-- -- the anon key -- because the page is `'use cache'` and tagged, same as the
-- category archive. A column that exists but is not granted to anon fails
-- PostgREST with 42501 (permission denied), which `readOptionalColumns` does
-- NOT treat as "absent" (only 42703 degrades); it is a different column grant
-- gap from 247's, caught before it shipped rather than after. This file is
-- the grant half of that read, kept out of 232 and 242 because editing an
-- already-written pending file risks colliding with whatever another session
-- is doing with it (see CLAUDE.md on parallel sessions), and a widening GRANT
-- is independent of everything else in either file.
--
-- ORDER: after 232 (adds opening_hours) and after 242 (adds
-- google_reviews_url). A GRANT naming a column that does not exist yet is a
-- hard Postgres error, not a no-op, so this file cannot apply before either.
-- Independent of every other pending file.
--
-- THE CODE RUNS WITHOUT THIS FILE, AND WITHOUT 232/242 TOO. Both reads go
-- through src/lib/supabase/optional-columns.ts (SUPPLIER_OPENING_HOURS_COLUMNS,
-- SUPPLIER_GOOGLE_REVIEWS_COLUMNS): a 42703 (column does not exist, i.e. 232
-- or 242 not yet applied) is logged once and read as NULL, same as every
-- other probed pair in this directory. Once the columns exist but before this
-- file lands, the same probe reads a 42501 as a thrown error instead --
-- `readOptionalColumns` only treats 42703 as "degrade", not "refused" --
-- which is exactly why the apply order above is a hard requirement and not a
-- preference.
--
-- Rehearse with BEGIN ... ROLLBACK per docs/RUNBOOK.md.

BEGIN;

GRANT SELECT (opening_hours) ON public.suppliers TO anon, authenticated;
GRANT SELECT (google_reviews_url) ON public.suppliers TO anon, authenticated;

COMMIT;
