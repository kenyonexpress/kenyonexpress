-- Preflight for migration 000: infrastructure dependencies
-- (public.admin_users, the observability schema, a has_permission stub)
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
  THEN 'OK: auth schema exists (admin_users references auth.users)'
  ELSE 'STOP: auth schema is missing, admin_users cannot reference auth.users'
END AS requires_auth_schema;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_users')
  THEN 'SKIP: public.admin_users already exists, CREATE TABLE IF NOT EXISTS is a no-op'
  ELSE 'OK: public.admin_users is absent and will be created'
END AS admin_users_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'observability')
  THEN 'SKIP: observability schema already exists'
  ELSE 'OK: observability schema is absent and will be created'
END AS observability_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'has_permission')
  THEN 'NOTE: public.has_permission already exists, the stub will REPLACE it; review the live body before applying'
  ELSE 'OK: public.has_permission is absent and the stub will be created'
END AS has_permission_check;
