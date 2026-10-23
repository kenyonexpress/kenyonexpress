-- Preflight for migration 276: stock_notifications
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products')
  THEN 'OK: public.products exists (required)'
  ELSE 'STOP: public.products is missing, this migration cannot apply'
END AS requires_products;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stock_notifications')
  THEN 'SKIP: public.stock_notifications already exists'
  ELSE 'OK: can create public.stock_notifications'
END AS stock_notifications_check;
