-- Three-persona RLS harness: anonymous, regular user, admin.
--
-- Unlike account_wallet_rls.sql this one is SELF-SEEDING: it creates its own
-- two customers and one admin inside the transaction, so it needs no -v
-- arguments and no pre-existing data. Everything rolls back; a violated
-- guarantee raises, so a clean exit is the verdict.
--
--   psql "$DATABASE_URL" -f tests/sql/rls_three_personas.sql
--
-- The same block runs through MCP execute_sql with the final RAISE swapped in
-- (see the comment at the bottom): there the deliberate exception is what
-- guarantees the rollback.
--
-- WHAT IT PROVES, per persona:
--
--   anon           sees no profile, no address, no rate-limit row; cannot
--                  read the reporting tables at all (no grant); sees only
--                  active products; cannot write an address.
--   user A         sees exactly their own profile/address/push token and
--                  NONE of user B's (cross-tenant), cannot insert an address
--                  for B, cannot update B's address, sees zero rows of the
--                  admin-read tables (reports, webhook events) and zero
--                  rate_limits rows despite the table grant.
--   admin          sees both users' addresses, the seeded report row and the
--                  seeded webhook event; still sees ZERO rate_limits rows,
--                  because the deny there is restrictive for all client roles.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_a      uuid := gen_random_uuid();
  v_b      uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
  v_addr_b uuid;
  v_count  integer;
BEGIN
  -- ── seed, as the table owner (bypasses RLS, rolled back at the end) ──────
  INSERT INTO auth.users (id, email)
  VALUES (v_a,     'rls-harness-a@example.test'),
         (v_b,     'rls-harness-b@example.test'),
         (v_admin, 'rls-harness-admin@example.test');

  -- A signup trigger may or may not have created the profile rows already.
  INSERT INTO public.profiles (id, email, role)
  VALUES (v_a,     'rls-harness-a@example.test',     'customer'::public.user_role),
         (v_b,     'rls-harness-b@example.test',     'customer'::public.user_role),
         (v_admin, 'rls-harness-admin@example.test', 'admin'::public.user_role)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.user_addresses (user_id, full_name, phone, street, city)
  VALUES (v_a, 'Harness A', '050-0000001', 'Test 1', 'Tel Aviv');
  INSERT INTO public.user_addresses (user_id, full_name, phone, street, city)
  VALUES (v_b, 'Harness B', '050-0000002', 'Test 2', 'Haifa')
  RETURNING id INTO v_addr_b;

  INSERT INTO public.push_tokens (user_id, expo_token)
  VALUES (v_a, 'ExponentPushToken[harness-a]'),
         (v_b, 'ExponentPushToken[harness-b]');

  INSERT INTO public.report_orders_daily (day) VALUES ('2000-01-01');
  INSERT INTO public.payment_webhook_events (provider, external_event_id)
  VALUES ('harness', 'rls-harness-evt-1');
  INSERT INTO public.rate_limits (key) VALUES ('rls-harness-key');

  -- ═══ persona 1: anonymous ════════════════════════════════════════════════
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: anon reads % profile rows', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_addresses;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: anon reads % user_addresses rows', v_count;
  END IF;

  BEGIN
    SELECT count(*) INTO v_count FROM public.rate_limits;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'SECURITY: anon reads % rate_limits rows', v_count;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- no grant is equally fine
  END;

  BEGIN
    SELECT count(*) INTO v_count FROM public.report_orders_daily;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'SECURITY: anon reads % report_orders_daily rows', v_count;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE status <> 'active'::public.product_status OR deleted_at IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: anon sees % non-active products', v_count;
  END IF;

  BEGIN
    INSERT INTO public.user_addresses (user_id, full_name, phone, street, city)
    VALUES (v_a, 'Anon Smuggle', '050', 'x', 'x');
    RAISE EXCEPTION 'SECURITY: anon inserted a user_address';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  RESET ROLE;

  -- ═══ persona 2: regular user A (cross-tenant against B) ══════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'user A should see exactly their own profile, saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_addresses WHERE user_id = v_a;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'user A cannot read their own address (saw %)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_addresses WHERE user_id = v_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: user A reads % of user B''s addresses', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.push_tokens WHERE user_id = v_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: user A reads % of user B''s push tokens', v_count;
  END IF;

  BEGIN
    INSERT INTO public.user_addresses (user_id, full_name, phone, street, city)
    VALUES (v_b, 'Planted By A', '050', 'x', 'x');
    RAISE EXCEPTION 'SECURITY: user A inserted an address for user B';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN check_violation THEN NULL; -- RLS WITH CHECK surfaces as 42501 or 23514 wrapper
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  UPDATE public.user_addresses SET city = 'Hijacked' WHERE id = v_addr_b;
  IF FOUND THEN
    RAISE EXCEPTION 'SECURITY: user A updated user B''s address';
  END IF;

  SELECT count(*) INTO v_count FROM public.rate_limits;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: user A reads % rate_limits rows', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.report_orders_daily;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: user A reads % report_orders_daily rows', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.payment_webhook_events;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: user A reads % payment_webhook_events rows', v_count;
  END IF;

  RESET ROLE;

  -- ═══ persona 3: admin ════════════════════════════════════════════════════
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'fixture: admin persona does not satisfy is_admin()';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_addresses WHERE user_id IN (v_a, v_b);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'admin should see both harness addresses, saw %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.report_orders_daily WHERE day = '2000-01-01';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'admin cannot read report_orders_daily (172 policy or grant missing?)';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.payment_webhook_events WHERE external_event_id = 'rls-harness-evt-1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'admin cannot read payment_webhook_events (172 policy missing?)';
  END IF;

  -- The plumbing deny is RESTRICTIVE: even an admin JWT sees nothing.
  SELECT count(*) INTO v_count FROM public.rate_limits;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: admin JWT reads % rate_limits rows through PostgREST roles', v_count;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'rls_three_personas: all assertions passed';
  -- MCP variant: replace the NOTICE above with
  --   RAISE EXCEPTION 'RLS_HARNESS_PASS';
  -- so the transaction is guaranteed to roll back without a psql ROLLBACK.
END
$$;

ROLLBACK;
