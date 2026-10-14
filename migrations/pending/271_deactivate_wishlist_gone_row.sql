-- 271_deactivate_wishlist_gone_row.sql
--
-- `/wishlist` answers 410 on production, and it is a live route.
--
-- MEASURED 2026-10-14 (UX18, logs/ux18/before.json): a signed-in customer
-- opening "רשימת המשאלות" from the account nav was sent to `/wishlist`, and
-- the proxy answered 410 before routing. The row:
--
--   source_path   target_path   status_code   is_active   created_at
--   /wishlist     ''            410           true        2026-09-09 09:05
--
-- read through the anon REST endpoint, which the table's SELECT policy
-- allows. It came from the 09.09 run of 192 (the legacy WordPress map), when
-- `/wishlist` was a retired WooCommerce path and this app had no route of
-- that name. The route exists since STEP 12 (`src/app/(store)/wishlist`),
-- and the regenerated map (`data/legacy/redirect-map.json`) already lists
-- `/wishlist` under "source_is_live" ("serves 200 today; a row here would
-- take it down"). Production never received that regeneration, so the
-- old row is still active and the proxy honours it (`src/proxy.ts`, "a 410
-- is a decision we made").
--
-- WHAT THIS DOES
--
-- Deactivates the row rather than deleting it: `is_active` is the switch the
-- proxy's loader filters on, the row stays as evidence of what the old site
-- served, and a re-run of 192 sees the same shape it wrote. Idempotent.
--
-- WHAT IT DOES NOT DO
--
-- `/my-wishlist` (410, same seed) stays: that path never existed here and
-- WooCommerce's "my wishlist" is confirmed gone. `/account/wishlist` has no
-- row and needs none: since UX18 it is a page inside the account shell, and
-- the tab does not depend on this migration. The header's heart still
-- points at `/wishlist` and stays dead until this is applied.
--
-- The proxy caches the table for five minutes (TTL_MS in
-- src/lib/seo/redirects.ts), so a warm instance serves the 410 for up to
-- five minutes after this runs.

update public.seo_redirects
   set is_active = false
 where source_path = '/wishlist'
   and status_code = 410
   and is_active = true;
