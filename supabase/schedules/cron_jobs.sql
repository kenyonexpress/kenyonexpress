-- ===========================================================================
-- cron_jobs.sql  (APPLY-TIME SCRIPT, NOT A NUMBERED MIGRATION)
--
-- pg_cron schedules for queue processing, reminders, and outbox draining.
-- Kept out of supabase/migrations on purpose: schedules are environment state,
-- not schema. Running this twice is safe (cron.schedule upserts by job name).
--
-- All times below are UTC (pg_cron has no timezone). The schedule intent is
-- written next to each entry; DST shifts them by an hour twice a year.
--
-- Prerequisites: 130_pg_cron_pg_net.sql
-- Run via Supabase MCP execute_sql (or the SQL editor) once per environment.
-- ===========================================================================

-- Ensure pg_cron extension exists (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant schema usage to postgres role (required for cron.schedule)
GRANT USAGE ON SCHEMA cron TO postgres;

-- ---------------------------------------------------------------------------
-- 1. Notification outbox drain (every 5 minutes)
-- ---------------------------------------------------------------------------

/**
 * Drains notification_outbox (email + push + WhatsApp) via /api/cron/notifications.
 * Runs every 5 minutes for responsive email delivery and push notifications.
 *
 * Batch size: 50 rows per run (defined in route.ts)
 * Backoff: 2, 8, 32, 128 minutes after failures
 * Max attempts: 5 before dead status
 */
SELECT cron.schedule(
  'drain_notification_outbox',
  '*/5 * * * *',
  $$SELECT public.fn_drain_notification_outbox()$$
);

-- ---------------------------------------------------------------------------
-- 2. Search index outbox drain (every 5 minutes)
-- ---------------------------------------------------------------------------

/**
 * Drains search_index_outbox via /api/cron/health.
 * Runs every 5 minutes to keep Meilisearch index in sync.
 *
 * Also runs health checks and alerts via ntfy if dependencies are down.
 * Batch size: 50 jobs per run
 * Backoff: 2, 8, 32, 128, 512 minutes (capped, no death)
 */
SELECT cron.schedule(
  'drain_search_outbox',
  '*/5 * * * *',
  $$SELECT public.fn_drain_search_outbox()$$
);

-- ---------------------------------------------------------------------------
-- 3. Voucher expiry and reminders (daily at 02:00 UTC = ~09:00 Israel)
-- ---------------------------------------------------------------------------

/**
 * Processes voucher expiry and sends reminders via /api/cron/expire-vouchers.
 * Runs daily at 02:00 UTC (morning Israel time).
 *
 * Two steps:
 * 1. expire_vouchers() - flips issued → expired past expires_at
 * 2. credit_expired_vouchers() - credits customer wallet (500 per run cap)
 * 3. Sends expiry reminders via notification_outbox
 */
SELECT cron.schedule(
  'process_voucher_reminders',
  '0 2 * * *',
  $$SELECT public.fn_process_voucher_reminders()$$
);

-- ---------------------------------------------------------------------------
-- 4. Cleanup old pg_net responses (daily at 03:00 UTC)
-- ---------------------------------------------------------------------------

/**
 * Purges completed HTTP responses older than 7 days from net._http_response.
 * Prevents unbounded growth of the response log table.
 */
SELECT cron.schedule(
  'cleanup_pg_net_responses',
  '0 3 * * *',
  $$DELETE FROM net._http_response WHERE created < now() - interval '7 days'$$
);

-- ---------------------------------------------------------------------------
-- Configuration settings (required by wrapper functions)
-- ---------------------------------------------------------------------------

/**
 * Set application URL and cron secret for pg_net HTTP calls.
 * These are read by fn_drain_notification_outbox and friends.
 *
 * PRODUCTION: Run this with actual values:
 *   ALTER DATABASE postgres SET app.settings.app_url = 'https://kenyonexpress.co.il';
 *   ALTER DATABASE postgres SET app.settings.cron_secret = '<actual_secret>';
 *
 * STAGING/DEV: Use appropriate environment URLs
 */

-- Example (commented out - set per environment):
-- ALTER DATABASE postgres SET app.settings.app_url = 'https://kenyonexpress.co.il';
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'your-cron-secret-here';

-- ---------------------------------------------------------------------------
-- Verification and management queries
-- ---------------------------------------------------------------------------

-- List all cron jobs:
-- SELECT jobid, jobname, schedule, active, database FROM cron.job ORDER BY jobname;

-- Check recent job runs:
-- SELECT
--   jobid,
--   jobname,
--   status,
--   start_time,
--   end_time,
--   return_message
-- FROM cron.job_run_details
-- ORDER BY start_time DESC
-- LIMIT 20;

-- Check pg_net HTTP responses (recent):
-- SELECT
--   id,
--   created,
--   status_code,
--   content::text,
--   error_msg
-- FROM net._http_response
-- ORDER BY created DESC
-- LIMIT 20;

-- Disable a job:
-- SELECT cron.unschedule('drain_notification_outbox');

-- Re-enable a job:
-- SELECT cron.schedule(
--   'drain_notification_outbox',
--   '*/5 * * * *',
--   $$SELECT public.fn_drain_notification_outbox()$$
-- );

-- Check database settings:
-- SELECT name, setting FROM pg_settings WHERE name LIKE 'app.settings.%';

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------

/**
 * MONITORING: Check cron.job_run_details regularly for failures.
 * Set up alerts if return_message contains 'ERROR' or status = 'failed'.
 *
 * TIMEZONE: All times are UTC. Israel is UTC+2 (winter) or UTC+3 (summer).
 * Adjust schedules if business hours matter.
 *
 * FREQUENCY: 5-minute intervals are aggressive but necessary for:
 * - Responsive email delivery (order confirmations)
 * - Near-real-time search index updates
 * - Timely push notifications
 *
 * COST: pg_cron and pg_net are included in Supabase Pro. No additional charge.
 *
 * FAILOVER: If pg_net fails, the Vercel cron routes can still be called
 * directly as a fallback. The HTTP endpoints are idempotent.
 *
 * BACKUP POINTER: External backup scripts should call fn_record_backup()
 * to update backup_log. Example:
 *
 *   psql "$DATABASE_URL" -c "SELECT public.fn_record_backup(
 *     'pg_dump',
 *     '/path/to/backup.tar.gz',
 *     890000000,
 *     'cron@system'
 *   );"
 */
