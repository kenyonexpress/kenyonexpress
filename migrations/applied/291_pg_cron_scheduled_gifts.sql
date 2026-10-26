-- 291: pg_cron job for scheduled gift delivery
--
-- Creates a cron job that runs every hour to process scheduled gift emails.
-- The job calls the existing notification drain endpoint which processes
-- notification_outbox rows where next_attempt_at <= NOW().
--
-- PREREQUISITES:
-- - pg_cron extension must be installed
-- - CRON_SECRET environment variable must be set
-- - APP_BASE_URL must point to the deployed application
--
-- Rollback:
-- SELECT cron.unschedule('process-scheduled-gifts');

-- Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job to run every hour at minute 0
-- This processes notification_outbox rows where next_attempt_at <= NOW()
-- including scheduled gift deliveries
SELECT cron.schedule(
  'process-scheduled-gifts',
  '0 * * * *', -- Every hour at :00
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.base_url') || '/api/cron/notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Store the configuration in app settings for the cron job to read
-- These must be set via ALTER DATABASE or configured in the Supabase dashboard
COMMENT ON EXTENSION pg_cron IS 'Requires configuration:
  ALTER DATABASE postgres SET app.settings.base_url = ''https://kenyonexpress.co.il'';
  ALTER DATABASE postgres SET app.settings.cron_secret = ''<CRON_SECRET>'';
';

-- Verify the job was created
SELECT jobid, schedule, command
FROM cron.job
WHERE jobname = 'process-scheduled-gifts';
