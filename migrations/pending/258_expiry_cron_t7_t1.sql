-- 258_expiry_cron_t7_t1.sql (idempotent)
--
-- S20, 2026-11-04. Two pg_cron jobs, T-7 and T-1, each a GET to
-- /api/cron/expiry with `Authorization: Bearer CRON_SECRET`. The route
-- enqueues its one bucket and drains the outbox in the same call: push by
-- default, email only for a customer who switched it on, plus the in-app bell.
--
-- MEASURED ON PRODUCTION BEFORE WRITING THIS (2026-11-04):
--
--   * 162 IS applied: twelve `ke-*` jobs, every one `net.http_post` to
--     `APP_BASE_URL`. `APP_BASE_URL` is the apex, which answers 308 to www;
--     pg_net follows it, and every cron route exports GET only, so all 258
--     rows in `net._http_response` are 405. `cron.job_run_details` says
--     "succeeded" for all of them, because pg_net only enqueues.
--     So `ke-notifications` has never drained anything and `ke-expire-vouchers`
--     has never enqueued a reminder (0 `voucher_expiring` rows, ever).
--   * `push-expiry-reminders` (jobid 142, `0 6 * * *`) POSTs to
--     `/api/push/send`, a route that does not exist, with a URL built from
--     `current_setting('app.settings.base_url')`, a GUC that is not set. It
--     fails every morning with "unrecognized configuration parameter". It is
--     the dead predecessor of this exact feature, so it is unscheduled here.
--
-- WHAT THIS FILE DOES:
--
--   1. Re-seeds the vault's `APP_BASE_URL` to https://www.kenyonexpress.co.il
--      if, and only if, it is the apex. That is the fix preflight_250 named.
--      A bearer GET does not survive a cross-host redirect (libcurl drops
--      Authorization when the host changes). The twelve 162 jobs read the same
--      secret; they answer 405 before this and 405 after it, so nothing about
--      them changes. Correcting them to GET is its own item.
--   2. Unschedules `push-expiry-reminders`.
--   3. Schedules `ke-expiry-t7` at 23:20 UTC and `ke-expiry-t1` at 23:25 UTC,
--      both after Jerusalem midnight (01:20/01:25 winter, 02:20/02:25
--      summer), so `days_remaining` is counted from the new Jerusalem day,
--      and after the 23:15 sweep, so a voucher the sweep expires is no longer
--      `issued` and is not reminded about.
--
-- SECRETS ARE NOT INLINED. The commands read CRON_SECRET and APP_BASE_URL from
-- the vault at run time. `cron.schedule(name, ...)` upserts by name, so
-- re-running this file is a no-op.
--
-- ROLLBACK:
--   select cron.unschedule(jobname) from cron.job where jobname in ('ke-expiry-t7', 'ke-expiry-t1');
--   -- push-expiry-reminders was never able to run; its original command, for the record:
--   --   SELECT net.http_post(url := current_setting('app.settings.base_url') || '/api/push/send',
--   --     headers := jsonb_build_object('Content-Type', 'application/json',
--   --       'x-cron-secret', current_setting('app.settings.cron_secret')), body := '{}'::jsonb);
--   -- APP_BASE_URL back to the apex (not recommended):
--   --   select vault.update_secret((select id from vault.secrets where name = 'APP_BASE_URL'),
--   --     'https://kenyonexpress.co.il');

BEGIN;

DO $$
DECLARE
  v_base text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION '258: pg_cron is not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION '258: pg_net is not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET') THEN
    RAISE EXCEPTION '258: vault secret CRON_SECRET is missing';
  END IF;

  SELECT decrypted_secret INTO v_base FROM vault.decrypted_secrets WHERE name = 'APP_BASE_URL';
  IF v_base IS NULL THEN
    RAISE EXCEPTION '258: vault secret APP_BASE_URL is missing';
  END IF;

  -- The apex answers 308 to www. Re-seed it; a public URL, not a secret.
  IF rtrim(v_base, '/') = 'https://kenyonexpress.co.il' THEN
    PERFORM vault.update_secret(
      (SELECT id FROM vault.secrets WHERE name = 'APP_BASE_URL'),
      'https://www.kenyonexpress.co.il'
    );
  ELSIF v_base NOT LIKE 'https://%' THEN
    RAISE EXCEPTION '258: APP_BASE_URL is not an https URL';
  END IF;
END $$;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'push-expiry-reminders';

SELECT cron.schedule(
  'ke-expiry-t7',
  '20 23 * * *',
  $cmd$
    select net.http_get(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'APP_BASE_URL'), '/')
             || '/api/cron/expiry?days=7',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      timeout_milliseconds := 55000
    );
  $cmd$
);

SELECT cron.schedule(
  'ke-expiry-t1',
  '25 23 * * *',
  $cmd$
    select net.http_get(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'APP_BASE_URL'), '/')
             || '/api/cron/expiry?days=1',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      timeout_milliseconds := 55000
    );
  $cmd$
);

COMMIT;

-- VERIFY:
--   select jobname, schedule, active from cron.job
--    where jobname in ('ke-expiry-t7', 'ke-expiry-t1', 'push-expiry-reminders') order by jobname;
--     -- two rows, active; push-expiry-reminders gone
--   select jobname, position('net.http_get' in command) > 0 as is_get,
--          position('vault.decrypted_secrets' in command) > 0 as reads_vault
--     from cron.job where jobname like 'ke-expiry-t%';
--   -- next morning:
--   select status_code, left(content, 160), created from net._http_response
--    order by created desc limit 5;   -- 200 once /api/cron/expiry is deployed, 404 before
