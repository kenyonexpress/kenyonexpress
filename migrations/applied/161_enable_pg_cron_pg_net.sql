-- 161_enable_pg_cron_pg_net.sql (idempotent)
--
-- APPLIED to production through MCP on 2026-09-03 and verified.
--
-- The schemas are not a style choice, they are what production reports:
--
--   select e.extname, n.nspname, e.extversion
--     from pg_extension e join pg_namespace n on n.oid = e.extnamespace
--    where e.extname in ('pg_cron', 'pg_net');
--
--   pg_cron  pg_catalog   1.6.4
--   pg_net   extensions   0.20.0
--
-- pg_cron can only live in the schema it was installed into, so naming a
-- different one here would make this file a description of a database that
-- does not exist. Both statements are `if not exists` and re-running is a no-op.
--
-- WHY BOTH. pg_cron schedules; it cannot make an outbound request. pg_net adds
-- net.http_post, which is what lets a scheduled job reach a Vercel route. Either
-- one alone leaves the scheduler unable to do the only thing it is wanted for.
--
-- THE GRANT. pg_cron creates the `cron` schema owned by the superuser. Without
-- USAGE on it, `postgres` -- the role every later migration runs as -- cannot
-- call cron.schedule at all, so 162 would fail on its first statement.
--
-- ROLLBACK (drops every scheduled job with it -- see 162 for what those are):
--
--   revoke usage on schema cron from postgres;
--   drop extension if exists pg_net;
--   drop extension if exists pg_cron;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
grant usage on schema cron to postgres;
