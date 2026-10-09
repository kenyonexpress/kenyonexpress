-- preflight_169.sql -- run each block through MCP execute_sql BEFORE 169.

-- (1) The function exists with exactly the 151 signature.
--     EXPECT: one row, fn_ingest_analytics_events(jsonb, uuid, text, text).
select p.oid::regprocedure as signature, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'fn_ingest_analytics_events';

-- (2) The current whitelist is 151's eight-name one (the before picture).
--     EXPECT: the body contains the eight client names and NOT
--     'begin_checkout'. If it already contains it, 169 (or a variant) has
--     been applied -- stop and compare.
select position('begin_checkout' in pg_get_functiondef(p.oid)) > 0 as already_widened
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'fn_ingest_analytics_events';

-- (3) Grants stay as 151 set them: service_role only.
--     EXPECT: service_role EXECUTE, no anon, no authenticated.
select grantee, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public' and routine_name = 'fn_ingest_analytics_events'
 order by grantee;

-- (4) Scale note: how many events exist (no lock concern -- CREATE OR
--     REPLACE FUNCTION does not touch the table). EXPECT: a count.
select count(*) from public.analytics_events;
