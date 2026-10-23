-- Preflight for migration 288: customer RFM segmentation (was 130 under supabase/migrations)
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders')
  THEN 'OK: public.orders exists (required)'
  ELSE 'STOP: public.orders is missing, this migration cannot apply'
END AS requires_orders;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_rfm_scores')
  THEN 'SKIP: public.customer_rfm_scores already exists'
  ELSE 'OK: can create public.customer_rfm_scores'
END AS customer_rfm_scores_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_segments')
  THEN 'SKIP: public.customer_segments already exists'
  ELSE 'OK: can create public.customer_segments'
END AS customer_segments_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_segment_tags')
  THEN 'SKIP: public.user_segment_tags already exists'
  ELSE 'OK: can create public.user_segment_tags'
END AS user_segment_tags_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'fn_calculate_rfm_scores')
  THEN 'NOTE: public.fn_calculate_rfm_scores already exists; CREATE OR REPLACE will overwrite it, read the live body first'
  ELSE 'OK: can create public.fn_calculate_rfm_scores'
END AS fn_calculate_rfm_scores_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'fn_segment_users')
  THEN 'NOTE: public.fn_segment_users already exists; CREATE OR REPLACE will overwrite it, read the live body first'
  ELSE 'OK: can create public.fn_segment_users'
END AS fn_segment_users_check;
