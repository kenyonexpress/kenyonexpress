-- Preflight for migration 195: observability.perf_tickets
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
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'observability' AND tablename = 'perf_tickets')
  THEN 'SKIP: observability.perf_tickets already exists'
  ELSE 'OK: can create observability.perf_tickets'
END AS perf_tickets_check;
