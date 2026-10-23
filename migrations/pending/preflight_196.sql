-- Preflight for migration 196: observability.get_p95_stats
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'observability')
  THEN 'OK: schema observability exists (required)'
  ELSE 'STOP: schema observability is missing; apply 192_observability_schema.sql first'
END AS requires_schema_observability;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'observability' AND tablename = 'p95_latency_samples')
  THEN 'OK: observability.p95_latency_samples exists (required)'
  ELSE 'STOP: observability.p95_latency_samples is missing, this migration cannot apply'
END AS requires_p95_latency_samples;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'observability' AND p.proname = 'get_p95_stats')
  THEN 'NOTE: observability.get_p95_stats already exists; CREATE OR REPLACE will overwrite it, read the live body first'
  ELSE 'OK: can create observability.get_p95_stats'
END AS get_p95_stats_check;
