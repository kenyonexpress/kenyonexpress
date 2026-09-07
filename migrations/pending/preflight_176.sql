-- preflight_176.sql -- run each block through MCP execute_sql BEFORE 176.
--
-- Read-only. Run against production 2026-09-07; answers recorded under EXPECT.

-- (1) The defect is still present, i.e. nobody fixed it in the meantime.
--     EXPECT: true. A false means production has already been changed and 176
--     must be re-derived against whatever is there now rather than applied.
select pg_get_functiondef(p.oid) like '%DELETE FROM public.rate_limits WHERE key = v_key%'
         as still_deletes_on_success
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'verify_supplier_staff_pin';

-- (2) The signature 176 replaces is the signature that exists. CREATE OR
--     REPLACE with a different argument list creates a SECOND overload instead
--     of replacing, and both would then be callable.
--     EXPECT: exactly one row, args 'p_pin text', returns a TABLE, prosecdef t.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid)             as returns,
       p.prosecdef,
       array_to_string(p.proconfig, ',')         as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'verify_supplier_staff_pin';

-- (3) The ACL before the change, so a diff after apply proves the grants did
--     not move. CREATE OR REPLACE preserves them, and this is the evidence.
--     EXPECT (07.09): authenticated has EXECUTE, anon does not.
select has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'verify_supplier_staff_pin';

-- (4) `rate_limits` still has the shape the function writes: key, attempts,
--     window_start, with a unique key so ON CONFLICT (key) resolves.
--     EXPECT: the three columns present, and at least one unique index on (key).
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'rate_limits'
   and column_name in ('key', 'attempts', 'window_start')
 order by column_name;

select i.relname as index_name, ix.indisunique, pg_get_indexdef(ix.indexrelid) as def
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
 where ix.indrelid = 'public.rate_limits'::regclass and ix.indisunique;

-- (5) How many live rows the change could affect right now. The new branch
--     only ever decrements an existing row, so a zero here means the first
--     real exercise of it will be a fresh attempt after apply.
--     EXPECT (07.09): 0 supplier_pin rows.
select count(*) as live_supplier_pin_windows
  from public.rate_limits
 where key like 'supplier_pin:%';

-- (6) Staff rows that the function searches. If this is zero, the function
--     currently cannot succeed at all and the change is untestable in
--     production until a supplier has staff.
--     EXPECT (07.09): recorded at apply time.
select count(*) as active_staff
  from public.supplier_staff
 where is_active and deleted_at is null;

-- ============================================================
-- MEASURED 2026-09-07 via MCP execute_sql, read-only:
--
--   still_deletes_on_success : true    (the defect is present)
--   overloads                : 1       args 'p_pin text' -> safe to REPLACE
--   unique indexes on rate_limits : 2  (ON CONFLICT (key) resolves)
--   live_supplier_pin_windows: 0
--   active_staff             : 0
--
-- THE LAST NUMBER IS THE ONE THAT MATTERS FOR SCHEDULING. With zero active
-- staff rows, `verify_supplier_staff_pin` cannot succeed at all today, so the
-- free-reset path is unreachable and the defect is not currently exploitable.
-- That makes this a fix to land BEFORE the first supplier onboards staff
-- rather than an incident. It also means the change cannot be exercised
-- against production until staff exist: verify it on a branch database, or
-- immediately after the first staff row is created.
-- ============================================================
