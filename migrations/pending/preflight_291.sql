-- Preflight for migration 291: order_items.platform_percent_snapshot (was 130 under supabase/migrations)
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_items')
  THEN 'OK: public.order_items exists (required)'
  ELSE 'STOP: public.order_items is missing, this migration cannot apply'
END AS requires_order_items;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'platform_percent_snapshot')
  THEN 'SKIP: order_items.platform_percent_snapshot already exists, the rename is a no-op or will fail'
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'platform_percent')
  THEN 'OK: order_items.platform_percent exists and can be renamed'
  ELSE 'STOP: neither platform_percent nor platform_percent_snapshot exists on order_items'
END AS rename_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'fn_order_items_snapshot_lock')
  THEN 'NOTE: fn_order_items_snapshot_lock exists; CREATE OR REPLACE will overwrite it, read the live body first'
  ELSE 'OK: can create fn_order_items_snapshot_lock'
END AS lock_function_check;
