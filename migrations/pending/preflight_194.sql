-- Preflight for migration 194: observability.p95_latency_samples
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
  THEN 'SKIP: observability.p95_latency_samples already exists'
  ELSE 'OK: can create observability.p95_latency_samples'
END AS p95_latency_samples_check;
