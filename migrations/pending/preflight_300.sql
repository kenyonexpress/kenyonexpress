-- Preflight for 300_profiles_orders_physical_count.sql
-- Read-only. The column add is idempotent; this reports whether it is already
-- there and confirms the tables the backfill joins on exist.

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'orders_physical_count'
) AS column_already_present;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL OR to_regclass('public.order_items') IS NULL THEN
    RAISE EXCEPTION 'orders / order_items missing; the 300 backfill cannot run';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'product_type'
  ) THEN
    RAISE EXCEPTION 'order_items.product_type missing; the 300 backfill cannot run';
  END IF;
END $$;
