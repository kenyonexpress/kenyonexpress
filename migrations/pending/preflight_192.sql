-- Preflight checks for migration 192: Notification history AND observability schema
-- (two files share this number: 192_notification_history.sql and 192_observability_schema.sql)
--
-- Verifies that table doesn't already exist

-- Check if table already exists
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_history')
  THEN 'SKIP: notification_history already exists'
  ELSE 'OK: Can create notification_history'
END AS notification_history_check;



-- 192_observability_schema.sql
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'observability')
  THEN 'SKIP: schema observability already exists (the CREATE SCHEMA is IF NOT EXISTS)'
  ELSE 'OK: can create schema observability'
END AS observability_schema_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'observability' AND p.proname IN ('update_timestamp', 'record_endpoint_hit', 'check_sla_breach'))
  THEN 'NOTE: an observability function already exists; CREATE OR REPLACE will overwrite it, read the live body first'
  ELSE 'OK: can create the observability functions'
END AS observability_functions_check;

-- All checks passed if this query runs without errors
