-- ===========================================================================
-- analytics_cron.sql  (APPLY-TIME SCRIPT, NOT A NUMBERED MIGRATION)
--
-- pg_cron schedules for the analytics domain. Kept out of supabase/migrations
-- on purpose: schedules are environment state, not schema. Running this twice
-- is safe (cron.schedule upserts by job name).
--
-- Cron split (ARCHITECTURE-ANALYTICS-BI.md section 8):
--   pg_cron      -> pure in-database SQL: rollup, matviews, partitions, purges
--   Vercel cron  -> anything that talks to the network: alerts, digest emails
--
-- All times below are UTC (pg_cron has no timezone). The Israel-local intent is
-- written next to each entry; DST shifts them by an hour twice a year, which is
-- irrelevant for jobs that run in the middle of the night and are idempotent.
--
-- Prerequisites: 033_analytics, 034_analytics_bi, 052_analytics_v3.
-- Run via Supabase MCP execute_sql (or the SQL editor) once per environment.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Yesterday's rollup. 23:10 UTC = 02:10 Israel (winter), after the coupon
-- expiry sweep at 01:50 so expired coupons are already in their final state.
SELECT cron.schedule(
  'analytics_rollup_daily',
  '10 23 * * *',
  $$SELECT public.fn_rollup_analytics_daily()$$
);

-- Matview refresh, 30 minutes after the rollup.
SELECT cron.schedule(
  'analytics_refresh_matviews',
  '40 23 * * *',
  $$SELECT public.fn_refresh_analytics_matviews()$$
);

-- Partition maintenance, monthly on the 1st at 03:00 Israel. Create ahead
-- first, then drop beyond retention: never leave the table without a home for
-- an incoming event.
SELECT cron.schedule(
  'analytics_partitions_monthly',
  '0 0 1 * *',
  $$SELECT public.fn_ensure_analytics_partitions(2), public.fn_drop_old_analytics_partitions(13)$$
);

-- ---------------------------------------------------------------------------
-- Verify / unschedule
-- ---------------------------------------------------------------------------
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
-- SELECT jobname, status, start_time, return_message
--   FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- SELECT cron.unschedule('analytics_rollup_daily');
