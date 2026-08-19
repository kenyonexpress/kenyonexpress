-- ============================================================================
-- 123: take anon off the functions it has no path to
-- ============================================================================
--
-- STATUS: APPLIED to production via MCP apply_migration on 2026-08-19
-- (name: revoke_anon_execute_dead_surface). Wave DB HARDENING step 13.
--
-- THE FOUR THIS STEP NAMED ARE ALL STILL REACHED FROM anon, so none of them is
-- revoked. That is the finding, not an omission:
--
--   is_admin()               30 policies that are TO public call it, including
--   is_supplier_member()     products_select_public, categories_select_public,
--                            suppliers_select_unified and
--                            product_images_select_unified. A policy predicate
--                            is evaluated as the caller, so anon needs EXECUTE
--                            to read the storefront at all. Measured with a
--                            probe that revoked it and rolled back: an
--                            anonymous SELECT on products went from 61 rows to
--                            "ERROR: permission denied for function is_admin".
--
--   check_rate_limit()       called through createClient(), which is the anon
--                            client for a logged-out visitor, from
--                            /redeem/[token], /api/search, /api/search/suggest,
--                            /api/a and /api/app/session, all keyed by IP
--                            precisely because the caller is anonymous. Worse
--                            than breaking: checkRateLimit fails OPEN, so
--                            revoking would silently switch rate limiting off
--                            for exactly the traffic it exists to limit.
--
--   fn_record_recent_search() called from the /search page with the caller's own
--                            client, anon when logged out. It no-ops without a
--                            session, but it is still called, and revoking
--                            would turn every anonymous search into a logged
--                            warning.
--
-- WHAT IS ACTUALLY DEAD. anon's remaining EXECUTE surface is four trigger
-- functions and one helper, and none of them has a caller path from anon:
--
--   set_updated_at, set_coupon_deals_updated_at, set_vendors_updated_at,
--   tg_products_track_stock_initial  - all RETURNS trigger. A trigger function
--     does not need EXECUTE on the invoking user; Postgres checks that at
--     CREATE TRIGGER time. Measured rather than taken from the manual: with
--     EXECUTE revoked from anon, an anonymous INSERT into carts, which fires
--     carts_set_updated_at, still succeeded. Probe rolled back. Called directly
--     over /rest/v1/rpc these only ever raise "can only be called as a trigger",
--     so the grant buys nothing and exposes a name.
--
--   voucher_scan_ip(text) - RETURNS inet, called only from redeem_voucher and
--     log_voucher_scan. Both are SECURITY DEFINER, so the inner call is checked
--     against the definer, and both are authenticated-only in the first place.
--
-- FROM PUBLIC, NOT JUST FROM anon. All five carry the default PUBLIC grant
-- (proacl shows "=X/postgres"), so REVOKE ... FROM anon on its own would change
-- nothing: anon would keep EXECUTE through PUBLIC. is_admin, by contrast, has
-- no PUBLIC entry and an explicit anon grant, which is what makes it deliberate.
--
-- authenticated IS NOT TOUCHED, as the step requires. Each of these five also
-- holds an explicit authenticated=X grant, so dropping PUBLIC leaves
-- authenticated with EXECUTE. Asserted at the end of this migration rather than
-- assumed; the migration fails if any of them lost it.
--
-- IDEMPOTENT: REVOKE on an already-revoked grant is a no-op.

REVOKE EXECUTE ON FUNCTION public.set_updated_at()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_coupon_deals_updated_at()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_vendors_updated_at()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_products_track_stock_initial() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.voucher_scan_ip(text)             FROM PUBLIC, anon;

DO $verify$
DECLARE
  fn        text;
  still_anon text := '';
  lost_auth  text := '';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.set_updated_at()',
    'public.set_coupon_deals_updated_at()',
    'public.set_vendors_updated_at()',
    'public.tg_products_track_stock_initial()',
    'public.voucher_scan_ip(text)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      still_anon := still_anon || fn || ' ';
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      lost_auth := lost_auth || fn || ' ';
    END IF;
  END LOOP;

  IF still_anon <> '' THEN
    RAISE EXCEPTION '123: anon still has EXECUTE on: %', still_anon;
  END IF;
  IF lost_auth <> '' THEN
    RAISE EXCEPTION '123: authenticated lost EXECUTE on: %', lost_auth;
  END IF;

  -- the four named by the step must be untouched
  IF NOT (has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
      AND has_function_privilege('anon', 'public.is_supplier_member(uuid)', 'EXECUTE')) THEN
    RAISE EXCEPTION '123: anon lost a function the storefront policies need';
  END IF;

  RAISE NOTICE '123: 5 revoked from anon, authenticated intact';
END
$verify$;
