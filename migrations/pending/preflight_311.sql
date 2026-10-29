-- Preflight check for migration 311 (read-only)
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
-- expect 2 rows (161 enables both)
select jobname from cron.job where jobname = 'push-expiry-reminders';
-- expect 0 rows; cron.schedule would otherwise replace the job of the same name
select current_setting('app.settings.base_url', true) as base_url,
       (current_setting('app.settings.cron_secret', true) is not null) as has_cron_secret;
-- both must be set, or the job fires with a null URL
