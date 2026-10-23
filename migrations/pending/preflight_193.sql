-- Preflight for migration 193: observability endpoint_metrics and sla_alerts
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.
-- (The cancelled 193_weekend_and_free_shipping.sql shares this number and is not part of it.)
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'observability')
  THEN 'OK: schema observability exists (required)'
  ELSE 'STOP: schema observability is missing; apply 192_observability_schema.sql first'
END AS requires_schema_observability;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'observability' AND tablename = 'endpoint_metrics')
  THEN 'SKIP: observability.endpoint_metrics already exists'
  ELSE 'OK: can create observability.endpoint_metrics'
END AS endpoint_metrics_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'observability' AND tablename = 'sla_alerts')
  THEN 'SKIP: observability.sla_alerts already exists'
  ELSE 'OK: can create observability.sla_alerts'
END AS sla_alerts_check;
