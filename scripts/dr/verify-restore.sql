-- The gate a restored database must pass before anyone calls a restore "done".
-- Run with: psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/dr/verify-restore.sql
--
-- pg_restore into vanilla Postgres exits nonzero on noise (grants to missing
-- roles, event triggers); THIS is the signal. Every check here raises, so a
-- failing restore fails the drill run loudly instead of averaging out.
--
-- Floors are calibrated to production on 2026-09-08: 73 public tables, 80
-- products, 12 categories, 10 auth users, orders still near zero pre-launch.
-- Row floors assert only what launch cannot shrink (catalog, users exist);
-- table-presence asserts the money path.

DO $$
DECLARE
  n int;
  missing text;
BEGIN
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname = 'public';
  IF n < 60 THEN
    RAISE EXCEPTION 'restored only % public tables (floor 60): truncated or partial dump', n;
  END IF;
  RAISE NOTICE 'public tables: %', n;

  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['orders','order_items','vouchers','payments','products','categories']) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'money-path tables missing after restore: %', missing;
  END IF;

  SELECT count(*) INTO n FROM public.products;
  IF n < 10 THEN
    RAISE EXCEPTION 'only % products restored (production carries the full catalog)', n;
  END IF;
  RAISE NOTICE 'products: %', n;

  SELECT count(*) INTO n FROM public.categories;
  IF n < 5 THEN
    RAISE EXCEPTION 'only % categories restored', n;
  END IF;
  RAISE NOTICE 'categories: %', n;

  -- Mode A of the DR doc: auth comes back with the data. If the dump was taken
  -- with DUMP_SCHEMAS=public this is the check that says so out loud.
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users absent: dump did not include the auth schema (accounts are NOT recoverable from this dump)';
  END IF;
  SELECT count(*) INTO n FROM auth.users;
  IF n < 1 THEN
    RAISE EXCEPTION 'auth.users restored empty';
  END IF;
  RAISE NOTICE 'auth users: %', n;

  RAISE NOTICE 'verify-restore: all checks passed';
END $$;

-- RPO evidence for the drill scorecard (informational, not a gate: order
-- volume is too low pre-launch to assert on).
SELECT
  (SELECT count(*) FROM public.orders)               AS orders,
  (SELECT count(*) FROM public.order_items)          AS order_items,
  (SELECT count(*) FROM public.payments)             AS payments,
  (SELECT count(*) FROM public.vouchers)             AS vouchers,
  (SELECT max(created_at) FROM public.orders)        AS newest_order_at;
