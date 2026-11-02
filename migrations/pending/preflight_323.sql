-- Preflight for migration 323: freeze order_items percent snapshots on paid orders (C141)
--
-- READ-ONLY. Every row must start with OK or NOTE. Any STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'platform_percent')
  THEN 'OK: order_items.platform_percent exists (the snapshot column the lock guards)'
  ELSE 'STOP: order_items.platform_percent is missing'
END AS platform_percent_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'supplier_split_percent')
   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'commission_percent_snapshot')
  THEN 'OK: supplier_split_percent and commission_percent_snapshot exist'
  ELSE 'STOP: a guarded column is missing on order_items'
END AS guarded_columns_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paid_at')
  THEN 'OK: orders.paid_at exists'
  ELSE 'STOP: orders.paid_at is missing'
END AS paid_at_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.order_items'::regclass AND tgname = 'trg_order_items_percent_snapshot_lock')
  THEN 'NOTE: trg_order_items_percent_snapshot_lock already exists; the migration recreates it'
  ELSE 'OK: trigger not yet present'
END AS trigger_check;
