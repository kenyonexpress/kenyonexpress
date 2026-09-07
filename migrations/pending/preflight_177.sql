-- preflight_177.sql -- read-only. Run each block before 177.

-- (1) The advisor's finding is still true: no search_path, not definer.
--     EXPECT (08.09): config '(none)', is_security_definer false.
select p.proname,
       p.prosecdef as is_security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(none)') as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'set_updated_at';

-- (2) How many triggers depend on it. This is the blast radius, and it is the
--     number to compare against AFTER the apply: CREATE OR REPLACE must leave
--     it identical, because the triggers reference the function by oid.
--     EXPECT (08.09): 52.
select count(*) as triggers_using_set_updated_at
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'set_updated_at' and not t.tgisinternal;

-- (3) The body is exactly what 177 restates, so the replace changes only the
--     config. Diff this against the CREATE block in 177 before applying.
select pg_get_functiondef(p.oid) as current_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'set_updated_at';

-- (4) `now()` resolves under the new path. If this returns a row, setting
--     search_path to pg_catalog cannot break the function body.
--     EXPECT: one row, pg_catalog.
select n.nspname as schema_holding_now
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname = 'now' and p.pronargs = 0;

-- ============================================================
-- MEASURED 2026-09-08 via MCP execute_sql, read-only:
--   is_security_definer : false
--   config              : (none)
--   triggers            : 52
--   now() lives in      : pg_catalog
-- ============================================================
