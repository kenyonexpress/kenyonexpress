-- Preflight for migration 289: ke-revenue-daily cron + public.revenue_daily
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  THEN 'OK: pg_cron installed (161)'
  ELSE 'STOP: pg_cron is not installed, apply 161 first'
END AS requires_pg_cron;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders')
  THEN 'OK: public.orders exists (required)'
  ELSE 'STOP: public.orders is missing, this migration cannot apply'
END AS requires_orders;
SELECT CASE
  WHEN (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'orders'
           AND column_name IN ('paid_at', 'deleted_at', 'status', 'total_ils_agorot',
                               'subtotal_ils_agorot', 'discount_ils_agorot',
                               'cashback_applied_ils_agorot')) = 7
  THEN 'OK: orders has paid_at, deleted_at, status and the four *_ils_agorot columns'
  ELSE 'STOP: orders is missing one of paid_at, deleted_at, status or the *_ils_agorot twins (138/147)'
END AS orders_columns_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'order_status' AND e.enumlabel = 'refunded')
   AND EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'order_status' AND e.enumlabel = 'cancelled')
  THEN 'OK: order_status has refunded and cancelled'
  ELSE 'STOP: order_status lacks refunded or cancelled; the function filter would fail'
END AS order_status_labels_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'revenue_daily')
  THEN 'SKIP: public.revenue_daily already exists; CREATE IF NOT EXISTS will keep it, compare its columns to the file'
  ELSE 'OK: can create public.revenue_daily'
END AS revenue_daily_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'aggregate_daily_revenue')
  THEN 'NOTE: public.aggregate_daily_revenue already exists; CREATE OR REPLACE will overwrite it, read the live body first'
  ELSE 'OK: can create public.aggregate_daily_revenue'
END AS aggregate_daily_revenue_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ke-revenue-daily')
  THEN 'NOTE: ke-revenue-daily already scheduled; cron.schedule will replace it by name'
  ELSE 'OK: ke-revenue-daily not yet scheduled'
END AS cron_job_check;
SELECT CASE
  WHEN (SELECT count(*) FROM public.orders WHERE paid_at IS NOT NULL AND total_ils_agorot IS NULL) = 0
  THEN 'OK: every paid order has total_ils_agorot'
  ELSE 'NOTE: some paid orders have NULL total_ils_agorot; they will show in revenue_daily.missing_agorot_count'
END AS agorot_backfill_check;
