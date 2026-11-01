-- 311: pg_cron job for voucher-expiry reminders (C14)
--
-- Once a day, 06:00 UTC (08:00 or 09:00 in Israel), calls /api/push/send,
-- which queues the T-7 and T-1 voucher_expiring notices and drains the outbox
-- so browser push, app push and mail go out.
--
-- PREREQUISITES: pg_cron and pg_net (161), and the two settings below, as in 291.
--   ALTER DATABASE postgres SET app.settings.base_url = 'https://kenyonexpress.co.il';
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<CRON_SECRET>';
--
-- Rollback: SELECT cron.unschedule('push-expiry-reminders');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'push-expiry-reminders',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.base_url') || '/api/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
