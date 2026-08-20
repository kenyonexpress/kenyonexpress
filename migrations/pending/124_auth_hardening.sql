-- ============================================================================
-- 124: take anon off the supplier directory, and authenticated off TRUNCATE
-- ============================================================================
--
-- STATUS: NOT APPLIED. Written to migrations/pending. Every claim below was
-- measured against production through MCP on 2026-08-20, and the migration
-- itself was DRY RUN there: all four statements and every assertion in the
-- verify block below executed inside one atomic DO block that ended by raising,
-- so the whole thing rolled back. It came back "DRY RUN CLEAN: every assertion
-- in 124 passed". Confirmed rolled back afterwards -- anon still holds SELECT
-- on suppliers as this file is written, which is the state it is meant to end.
--
-- NUMBERED 124, NOT 085. The step that asked for this named 085_auth_hardening,
-- but 085 is already an applied migration in supabase/migrations -- it is the
-- one src/lib/supplier/rbac.ts cites for redeem_voucher matching the full
-- membership set. pending/ runs 110..123; this is the next one.
--
-- ----------------------------------------------------------------------------
-- WHAT THE STEP ASKED FOR HAS NOTHING LEFT TO DO, AND THAT IS THE FIRST FINDING
-- ----------------------------------------------------------------------------
--
-- The brief was "REVOKE the functions that should not be exposed to anon".
-- 123 did that six days ago and the surface is now four functions:
--
--   check_rate_limit(text,integer,integer)   fn_record_recent_search(text)
--   is_admin()                               is_supplier_member(uuid)
--
-- All four are reached from anon in production, all four were re-measured
-- today, and 123's header explains each at length. Revoking any of them breaks
-- the storefront -- an anonymous SELECT on products goes from 61 rows to
-- "permission denied for function is_admin", because a policy predicate is
-- evaluated as the caller and 30 policies that are TO public call it. There is
-- no fifth function to revoke. Restating that is the honest answer to the step;
-- inventing a revoke to have something to show would be the dishonest one.
--
-- So this migration closes the two real holes that the same sweep turned up.
--
-- ----------------------------------------------------------------------------
-- 1. THE SUPPLIER DIRECTORY IS WORLD-READABLE, INCLUDING THE PARTS THAT SHOULD
--    NOT BE
-- ----------------------------------------------------------------------------
--
-- suppliers_select_unified is one policy, TO public, `deleted_at IS NULL OR
-- is_admin()`, and anon holds table SELECT. Measured under `SET LOCAL ROLE
-- anon`:
--
--   rows 11, contact_email 6, contact_phone 5, business_id 5, notes 6
--
-- business_id is the Israeli company number. notes is whatever an admin typed
-- about a business. That is `GET /rest/v1/suppliers?select=*` from a browser
-- with no account, eleven rows at a time.
--
-- NO APPLICATION CODE LOSES ANYTHING, and this was checked file by file rather
-- than assumed. Every read of `suppliers` in src/ goes through
-- createAdminClient(), which connects as service_role and is untouched here:
--
--   src/lib/product-detail.ts        id, name, city, address, contact_phone,
--                                    whatsapp, logo_url   (admin client)
--   src/lib/search/indexer.ts        name                 (admin client)
--   src/server/queries/orders.ts     id, name, address, city, contact_phone
--   src/server/actions/payments/checkout.ts  id, name, contact_phone, address,
--                                    logo_url
--   src/app/(admin)/**               (admin client)
--
-- indexer.ts carries the comment "suppliers table is admin-only under RLS".
-- It is not, and has not been; the code believed one thing and the database
-- did another. After this migration the comment becomes true.
--
-- WHY authenticated KEEPS (id, name) AND NOTHING ELSE. getSupplierSession in
-- src/lib/supplier/rbac.ts reads `supplier_members` with the USER-scoped client
-- and embeds `suppliers(name)`. PostgREST resolves that embed as the caller, so
-- a blanket revoke would leave every supplier portal without the name of the
-- business it belongs to. Measured in the rolled-back probe: with SELECT
-- revoked and (id, name) granted, the portal join still returned its supplier
-- name, `contact_email` was refused, and anon was refused the table outright.
--
-- ----------------------------------------------------------------------------
-- 2. TRUNCATE, WHICH RLS DOES NOT LIMIT AND NEVER HAS
-- ----------------------------------------------------------------------------
--
-- `authenticated` holds TRUNCATE on 52 of the 53 tables in public, payments,
-- orders, wallet_entries and settlement_events among them. Every other write
-- privilege on that list is backstopped by a policy; TRUNCATE is the one that
-- is not. Postgres does not apply row-level security to TRUNCATE at all, so
-- the policies that make DELETE safe say nothing about it.
--
-- IT IS NOT REACHABLE TODAY, and this is stated plainly rather than dressed up:
-- PostgREST exposes no TRUNCATE verb, and no function in public contains the
-- word (checked: 0 of them). The grant is dead surface. It is revoked because
-- it is one SECURITY INVOKER helper away from being live, and because 52 tables
-- of a privilege nobody can name a use for is the kind of thing that is easier
-- to remove now than to explain later.
--
-- anon already has TRUNCATE on 0 tables; it is named anyway so the statement
-- states the intended end state rather than the delta.
--
-- NEW TABLES WILL COME BACK GRANTED. Supabase's ALTER DEFAULT PRIVILEGES gives
-- anon and authenticated ALL on new tables in public, TRUNCATE included. This
-- migration does not change the default, because that affects every future
-- table created by any migration in flight and belongs in its own step with its
-- own probe. Recorded here so the next sweep knows why the count crept up.
--
-- ----------------------------------------------------------------------------
-- 3. v_low_stock, FINISHING WHAT 103 STARTED
-- ----------------------------------------------------------------------------
--
-- 103 locked the v_* views to postgres | service_role. v_low_stock still grants
-- SELECT to anon and authenticated, it is security_invoker = true, and it
-- selects `s.contact_email AS supplier_email`. It is a second door to the same
-- PII as section 1.
--
-- Neither role can read it TODAY, and only by accident: it calls
-- available_stock(), which is granted to neither, so both get "permission
-- denied for function available_stock" instead of a row. Measured for anon and
-- for authenticated separately. That makes this revoke a provable no-op now and
-- the difference between a leak and a refusal the day someone grants EXECUTE on
-- available_stock for an unrelated reason.
--
-- IDEMPOTENT: every statement is a REVOKE or a GRANT, both no-ops when the
-- privilege is already in the target state.

-- 1. the supplier directory
REVOKE SELECT ON public.suppliers FROM PUBLIC, anon, authenticated;
GRANT  SELECT (id, name) ON public.suppliers TO authenticated;

-- 2. TRUNCATE, on every table in the schema
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 3. the view 103 missed
REVOKE SELECT ON public.v_low_stock FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  leftover int;
  col      text;
BEGIN
  -- 1a. anon must not reach the table by any column.
  IF has_table_privilege('anon', 'public.suppliers', 'SELECT') THEN
    RAISE EXCEPTION '124: anon still holds table SELECT on suppliers';
  END IF;
  FOREACH col IN ARRAY ARRAY[
    'id','name','contact_email','contact_phone','notes','contact_name',
    'whatsapp','address','city','website','business_id','logo_url','status'
  ] LOOP
    IF has_column_privilege('anon', 'public.suppliers', col, 'SELECT') THEN
      RAISE EXCEPTION '124: anon still reads suppliers.%', col;
    END IF;
  END LOOP;

  -- 1b. authenticated keeps exactly the two columns the portal embed needs.
  IF NOT (has_column_privilege('authenticated', 'public.suppliers', 'id', 'SELECT')
      AND has_column_privilege('authenticated', 'public.suppliers', 'name', 'SELECT')) THEN
    RAISE EXCEPTION '124: the supplier portal lost the name of its own supplier';
  END IF;
  FOREACH col IN ARRAY ARRAY[
    'contact_email','contact_phone','notes','contact_name','whatsapp',
    'address','website','business_id'
  ] LOOP
    IF has_column_privilege('authenticated', 'public.suppliers', col, 'SELECT') THEN
      RAISE EXCEPTION '124: authenticated still reads suppliers.%', col;
    END IF;
  END LOOP;

  -- 1c. service_role is every real caller, so losing it would take the
  -- storefront's supplier block, the search index and the order snapshot with
  -- it. Asserted rather than assumed: a REVOKE naming PUBLIC can surprise.
  IF NOT has_table_privilege('service_role', 'public.suppliers', 'SELECT') THEN
    RAISE EXCEPTION '124: service_role lost SELECT on suppliers';
  END IF;

  -- 2. no TRUNCATE left on either browser-facing role.
  SELECT count(*) INTO leftover
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (has_table_privilege('anon', c.oid, 'TRUNCATE')
      OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  IF leftover > 0 THEN
    RAISE EXCEPTION '124: TRUNCATE still granted on % tables', leftover;
  END IF;

  -- ...and the roles that legitimately hold it still do. Dropping TRUNCATE
  -- from service_role would break nothing today and every future maintenance
  -- script tomorrow.
  IF NOT has_table_privilege('service_role', 'public.orders', 'TRUNCATE') THEN
    RAISE EXCEPTION '124: service_role lost TRUNCATE';
  END IF;

  -- 3. the view.
  IF has_table_privilege('anon', 'public.v_low_stock', 'SELECT')
     OR has_table_privilege('authenticated', 'public.v_low_stock', 'SELECT') THEN
    RAISE EXCEPTION '124: v_low_stock still readable by a browser role';
  END IF;

  -- The four functions section 1 of the header is about. Untouched, and the
  -- migration fails if a merge ever quietly revokes one: each is load-bearing
  -- for an anonymous page view.
  IF NOT (has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
      AND has_function_privilege('anon', 'public.is_supplier_member(uuid)', 'EXECUTE')
      AND has_function_privilege('anon', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE')
      AND has_function_privilege('anon', 'public.fn_record_recent_search(text)', 'EXECUTE')) THEN
    RAISE EXCEPTION '124: anon lost a function the storefront needs';
  END IF;

  RAISE NOTICE '124: suppliers closed to anon, (id,name) to authenticated; TRUNCATE off 52 tables; v_low_stock closed';
END
$verify$;
