-- 263_seo_redirects_release_compare.sql
--
-- Retire the two legacy 410 rows that shadow live routes: `/compare`
-- (STEP 56, the store's own compare page) and `/wishlist` (STEP 12, found
-- dead in production for the same reason and never released).
--
-- WHY A ROW CAN KILL A PAGE. `src/proxy.ts` resolves `seo_redirects` BEFORE
-- routing and answers a 410 row with a 410, so an active row for a path
-- the app now serves takes the working page off the internet with a status
-- that tells Google never to come back. 192 seeded these rows on 2026-09-09
-- when neither route existed; `scripts/build-legacy-redirects.mjs` now
-- drops both as `source_is_live` (the regenerated artefact is beside this
-- file in `data/legacy/redirect-map.json`), but a regenerated seed is not a
-- re-applied one, and production still carries the rows.
--
-- MEASURED BEFORE WRITING (production, 2026-10-08, read-only through the
-- management API):
--
--   source_path    target_path  status_code  is_active
--   /compare       ''           410          true
--   /wishlist      ''           410          true
--
-- `/yith-compare` and `/my-wishlist` are left as they are: neither is a
-- route here, and a 410 on them is still the right answer.
--
-- WHAT THIS DOES. Deactivates, not deletes: `is_active = false` is what the
-- proxy's loader filters on (`.eq('is_active', true)`), the row stays as the
-- record of what the old site had, and rollback is the same UPDATE in
-- reverse. Idempotent: a second run matches zero rows.
--
-- AFTER APPLYING. The proxy caches the map for five minutes
-- (`src/lib/seo/redirects.ts` TTL_MS), so a warm instance keeps answering
-- 410 for up to that long; a redeploy or five minutes, then
-- `curl -sI https://kenyonexpress.co.il/compare` answers 200.
--
-- ROLLBACK:
--   update public.seo_redirects set is_active = true
--    where source_path in ('/compare', '/wishlist') and status_code = 410;

update public.seo_redirects
   set is_active = false
 where source_path in ('/compare', '/wishlist')
   and status_code = 410
   and is_active = true;

-- Self-check: no active 410 may remain on either live route.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining
    from public.seo_redirects
   where source_path in ('/compare', '/wishlist')
     and status_code = 410
     and is_active = true;
  if remaining <> 0 then
    raise exception '263: % active 410 row(s) still shadow /compare or /wishlist', remaining;
  end if;
end $$;
