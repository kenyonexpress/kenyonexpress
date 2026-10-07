-- 255_slow_statements_rpc.sql
--
-- One service-role-only function: the slow statements Postgres itself has
-- measured, read out of pg_stat_statements at a mean-time floor (STEP 28,
-- logging, 07.10).
--
-- WHY THIS AND NOT log_min_duration_statement. The obvious way to get a
-- slow-query log out of Postgres is `log_min_duration_statement = 300ms`,
-- set on the `authenticator` role so every PostgREST session inherits it.
-- Measured on production on 2026-10-07 through the management API:
--
--   current_user = postgres, rolsuper = false
--   has_parameter_privilege(postgres, 'log_min_duration_statement', 'SET') = false
--   pg_settings.context for the parameter = superuser
--
-- Supabase's `postgres` is not a superuser and holds no SET grant on the
-- parameter, so an ALTER ROLE / ALTER DATABASE carrying it raises 42501 and
-- there is nothing a migration can do about that. What the same probe found
-- instead: pg_stat_statements is installed (schema `extensions`, 4,865
-- statements tracked), `postgres` is a member of pg_read_all_stats and reads
-- it in full, and 14 statements were already over a 300ms mean. So the
-- slow-query log here is a sample of that view, taken nightly by
-- /api/cron/slow-statements and written as one structured `db.slow_statement`
-- line per row, into the same stream (and the same Axiom dataset, same
-- 30-day retention) as the application's own `db.query_slow` warnings.
--
-- WHAT IT DOES. `fn_slow_statements(p_threshold_ms, p_limit)` returns the
-- top-level statements whose mean execution time is at or above the floor,
-- most total time first, with the executing role, call count, mean / max /
-- total milliseconds (integers; these are durations, not money), rows per
-- call, and the normalized query text cut to 300 characters. The text is
-- what pg_stat_statements stores: constants are already replaced by $n, so
-- no customer value can appear in it. Rows about pg_stat_statements itself
-- are excluded so the report does not report on reading the report.
--
-- WHO MAY CALL IT. SECURITY DEFINER, owned by postgres, because the view is
-- only readable by pg_read_all_stats members. EXECUTE is revoked from
-- PUBLIC, anon and authenticated and granted to service_role only: the one
-- caller is the cron route on createAdminClient() (lib/observability/
-- slow-statements.ts), and the revoked-functions test lists it by name. No
-- is_admin() gate inside, same shape as 150/151/194/228: a service-role
-- function is trusted by role, and auth.uid() is null for that caller anyway.
--
-- UNTIL APPLIED. The cron route gets PGRST202 (function not in the schema
-- cache), logs `db.slow_statements_unavailable` at info, answers 200 with
-- status "skipped", and nothing else changes. The application-side
-- db.query_slow warn (query-log-fetch.ts, 300ms since STEP 28) does not
-- depend on this file.
--
-- REHEARSED on production 2026-10-07 inside BEGIN/ROLLBACK through the
-- management API: the function compiled, returned 14 rows at 300ms (the top
-- offenders were PostgREST's own schema-cache reload, `SELECT name FROM
-- pg_timezone_names`, 571ms mean over 566 calls, and dashboard introspection
-- as supabase_read_only_user; none were application queries), service_role
-- had EXECUTE, authenticated and anon did not, and
-- to_regprocedure('public.fn_slow_statements(integer, integer)') was NULL
-- after the rollback.
--
-- Idempotent: CREATE OR REPLACE, REVOKE/GRANT. Re-running is a no-op.
--
-- ROLLBACK:
--   drop function if exists public.fn_slow_statements(integer, integer);

BEGIN;

create or replace function public.fn_slow_statements(
  p_threshold_ms integer default 300,
  p_limit integer default 20
)
returns table (
  queryid bigint,
  role text,
  calls bigint,
  mean_exec_ms integer,
  max_exec_ms integer,
  total_exec_ms bigint,
  rows_per_call integer,
  query text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.queryid,
         (select r.rolname::text from pg_catalog.pg_roles r where r.oid = s.userid),
         s.calls,
         round(s.mean_exec_time)::integer,
         round(s.max_exec_time)::integer,
         round(s.total_exec_time)::bigint,
         case when s.calls > 0 then (s.rows / s.calls)::integer else 0 end,
         left(regexp_replace(s.query, '\s+', ' ', 'g'), 300)
  from extensions.pg_stat_statements s
  where s.toplevel
    and s.mean_exec_time >= greatest(coalesce(p_threshold_ms, 300), 1)
    and s.query not ilike '%pg_stat_statements%'
  order by s.total_exec_time desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

comment on function public.fn_slow_statements(integer, integer) is
  'Top-level statements in pg_stat_statements whose mean execution time is at or above p_threshold_ms (default 300), most total time first, at most p_limit (default 20, cap 100). Query text is the normalized form ($n constants), cut to 300 chars. service_role only; read nightly by /api/cron/slow-statements. STEP 28, migration 255.';

revoke execute on function public.fn_slow_statements(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_slow_statements(integer, integer) to service_role;

DO $$
BEGIN
  IF to_regprocedure('public.fn_slow_statements(integer, integer)') IS NULL THEN
    RAISE EXCEPTION '255: fn_slow_statements was not created';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_slow_statements(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '255: authenticated still holds EXECUTE on fn_slow_statements';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_slow_statements(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '255: service_role lacks EXECUTE on fn_slow_statements';
  END IF;
END $$;

COMMIT;
