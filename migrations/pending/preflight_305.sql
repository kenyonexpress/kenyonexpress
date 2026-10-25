-- Preflight for 305_supplier_applications.sql. Read-only.
-- Expect: auth.users, set_updated_at, is_admin and audit_log_trigger_fn exist,
-- and supplier_applications does not yet exist.
select
  to_regclass('auth.users') is not null as auth_users_exists,
  to_regprocedure('public.set_updated_at()') is not null as set_updated_at_exists,
  to_regprocedure('public.is_admin()') is not null as is_admin_exists,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'audit_log_trigger_fn') as audit_trigger_fn_exists,
  to_regclass('public.supplier_applications') is null as supplier_applications_absent;
