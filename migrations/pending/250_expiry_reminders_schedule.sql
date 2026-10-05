-- 250_expiry_reminders_schedule.sql (idempotent)
--
-- NOT APPLIED. W06, 2026-10-05. Schedules the coupon expiry reminders (T-7 and
-- T-1) and the outbox drain that delivers them, through pg_cron + pg_net
-- calling the two authenticated cron routes. Nothing else: no table, no
-- function, no grant, no data.
--
-- =============================================================================
-- WHAT WAS ALREADY THERE, MEASURED AGAINST PRODUCTION ON 2026-10-05
-- =============================================================================
--
-- Every piece of the reminder EXCEPT the clock exists and is live:
--
--   * `enqueue_expiring_voucher_notices(integer[])` selects `issued` vouchers
--     whose Jerusalem expiry date is today+7 / today+1 and enqueues one
--     `voucher_expiring` row per voucher per bucket. Pending 227 widens the
--     match from one exact day to a window per bucket so a missed night is
--     recovered; this file does not depend on 227 and composes with it.
--   * `notification_outbox.dedupe_key` is UNIQUE, the insert is ON CONFLICT DO
--     NOTHING and the key is `voucher_expiring:<voucher_id>:<bucket>`, so the
--     outbox IS the reminder ledger: at most one row per voucher per bucket,
--     ever, however many nights re-select it. A second ledger table was
--     considered and rejected -- two tables answering "was this sent" is two
--     answers.
--   * `/api/cron/expire-vouchers` runs sweep, wallet credit, then the enqueue,
--     in that order, with `p_buckets => [7, 1]`.
--   * `/api/cron/notifications` drains the outbox: Hebrew RTL email through
--     Resend (`voucher_expiring` is on the Q09 customer-email list), web push
--     to every `push_subscriptions` row of the customer (plus Expo), and the
--     in-app bell -- each leg gated by `mayNotify` against
--     `notification_preferences`, which is exactly the table the personal
--     area's "everything in the app" switch writes (push + in_app rows for
--     every optional kind, `voucher_expiring` included).
--
-- What does not exist is anything that CALLS those two routes:
--
--   * `cron.job` holds one row, `report_tables_nightly`. Neither route is
--     scheduled anywhere that fires (Vercel cron was removed from
--     `vercel.json`; the GitHub workflow answers 401 on every run because the
--     two sides hold different secrets, 40/40 runs red as of 05.10).
--   * `notification_outbox` has NEVER held a `voucher_expiring` row.
--   * 18 issued vouchers carry an `expires_at`; 0 are inside 7 days today, so
--     nothing is owed this week, and the first owed reminder will be the first
--     one ever produced.
--
-- =============================================================================
-- WHY THIS IS NOT 162, AND WHAT 162 GETS WRONG (measured, not a preference)
-- =============================================================================
--
-- 162 (approved 2026-09-04, still pending) schedules twelve jobs. It would not
-- work as written, for three reasons each verified against production today:
--
--   1. It calls `net.http_post`. Every cron route exports GET only, and Next
--      answers an unexported method with 405 (its own docs:
--      `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
--      Verified on the live host: `POST /api/cron/health` -> 405, `GET` -> 401
--      without a bearer. Twelve jobs would fire 405 every tick and
--      `cron.job_run_details` would read "succeeded", because pg_net's job is
--      to enqueue the request, not to like the answer.
--   2. It reads the vault by `cron_secret` / `app_url`. The vault holds the
--      secrets under `CRON_SECRET` and `APP_BASE_URL` (names read on
--      2026-10-05; values never selected). 162's own guard would raise
--      "cron_secret missing" with the secret sitting one row away.
--   3. Its preflight requires `app_url` to be a `*.vercel.app` host because the
--      domain was dead on 04.09. The domain is live now, and `APP_BASE_URL` is
--      the APEX `https://kenyonexpress.co.il`, which answers `308` to
--      `https://www.kenyonexpress.co.il/...` (verified with one HEAD today).
--      A redirect is a dead end for a bearer call: either pg_net does not
--      follow it, or libcurl drops the Authorization header across hosts. Both
--      read as "the job ran" in pg_cron and as nothing at all in the route.
--
-- This file schedules only the two jobs the reminder needs, with `http_get`,
-- by the vault names that exist, and REFUSES at apply time if `APP_BASE_URL` is
-- the apex host rather than failing silently at 01:15 every night. It does not
-- edit 162: a parallel session may hold it, and an approved file is Ofir's to
-- change. ORDER: if 162 is ever applied as written it would re-upsert
-- `ke-expire-vouchers` and `ke-notifications` back to POST and raise on the
-- vault names first anyway; so 162 must be corrected on the same three points
-- before it is applied, and this file applies AFTER it (or instead of it for
-- these two names). `APPLY-ORDER.md` carries the rule.
--
-- =============================================================================
-- THE CLOCK
-- =============================================================================
--
-- `cron.timezone` is `GMT` on this project (read today). `15 23 * * *` is
-- 23:15 UTC = 01:15 Israel winter / 02:15 Israel summer: after Jerusalem
-- midnight, deliberately. The selection computes `days_remaining` from the
-- Jerusalem calendar date of `now()`, so a run at 23:15 UTC belongs to the
-- NEW Jerusalem day and a voucher that expires at end-of-day on the 12th is
-- "7 days" on the night the 5th becomes the 6th. Same expression as
-- `scripts/cron-jobs.json` and the GitHub workflow, so the manifest test pins
-- all three to one schedule.
--
-- `*/5 * * * *` for the drain mirrors the manifest too. The drain is idempotent
-- per leg (status columns + dedupe key + Resend idempotency key), so a tick that
-- overlaps a slow previous tick cannot double-send.
--
-- `ke-cron-history-prune` keeps `cron.job_run_details` to seven days. pg_cron
-- never prunes it; 31 rows today from one nightly job, and the drain alone adds
-- 288 a day.
--
-- SECRETS ARE NOT INLINED. Each command reads the secret and the base URL from
-- the vault AT RUN TIME, so `cron.job.command` stores neither, rotating the
-- secret needs no re-migration, and a missing vault row fails the job loudly
-- instead of calling with an empty bearer. The DO block below checks the
-- SHAPE of `APP_BASE_URL` and never puts the value in a message.
--
-- IDEMPOTENT: `cron.schedule(jobname, ...)` upserts by name (pg_cron >= 1.4;
-- production runs 1.6.4). Re-running replaces the three schedules.
--
-- ROLLBACK (whole file):
--   select cron.unschedule(jobname) from cron.job
--    where jobname in ('ke-expire-vouchers', 'ke-notifications', 'ke-cron-history-prune');

BEGIN;

DO $$
DECLARE
  v_base text;
  v_host text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION '250: pg_cron is not installed; apply 161 first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION '250: pg_net is not installed; apply 161 first';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET') THEN
    RAISE EXCEPTION '250: vault secret CRON_SECRET is missing; seed it with the value Vercel Production holds';
  END IF;

  SELECT decrypted_secret INTO v_base FROM vault.decrypted_secrets WHERE name = 'APP_BASE_URL';
  IF v_base IS NULL THEN
    RAISE EXCEPTION '250: vault secret APP_BASE_URL is missing; seed it with the host that answers the cron routes directly';
  END IF;

  -- Shape checks only. The value never reaches a message or a log.
  IF v_base NOT LIKE 'https://%' THEN
    RAISE EXCEPTION '250: APP_BASE_URL is not an https URL';
  END IF;
  v_host := split_part(substring(v_base FROM 9), '/', 1);
  IF v_host = 'kenyonexpress.co.il' THEN
    RAISE EXCEPTION
      '250: APP_BASE_URL is the apex host, which answers 308 to www; a bearer call does not survive the redirect. Re-seed it as https://www.kenyonexpress.co.il or the production *.vercel.app alias';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. The producer: sweep, wallet credit, then the T-7 / T-1 enqueue.
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'ke-expire-vouchers',
  '15 23 * * *',
  $cmd$
    select net.http_get(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'APP_BASE_URL'), '/')
             || '/api/cron/expire-vouchers',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      timeout_milliseconds := 55000
    );
  $cmd$
);

-- -----------------------------------------------------------------------------
-- 2. The drain: email through Resend, web push to every subscribed browser,
--    the in-app bell -- each leg behind the customer's switches.
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'ke-notifications',
  '*/5 * * * *',
  $cmd$
    select net.http_get(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'APP_BASE_URL'), '/')
             || '/api/cron/notifications',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      timeout_milliseconds := 55000
    );
  $cmd$
);

-- -----------------------------------------------------------------------------
-- 3. Housekeeping pg_cron does not do for itself.
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'ke-cron-history-prune',
  '0 3 * * *',
  $cmd$
    delete from cron.job_run_details where end_time < now() - interval '7 days';
  $cmd$
);

COMMIT;

-- VERIFY (after applying):
--   select jobname, schedule, active from cron.job
--    where jobname in ('ke-expire-vouchers', 'ke-notifications', 'ke-cron-history-prune')
--    order by jobname;                                               -- three rows, active
--   select command from cron.job where jobname = 'ke-expire-vouchers';
--     -- carries 'net.http_get' and 'vault.decrypted_secrets', never a literal secret
--   -- next morning:
--   select jobname, status, return_message, start_time
--     from cron.job_run_details d join cron.job j using (jobid)
--    where jobname like 'ke-%' order by start_time desc limit 10;
--   select status_code, left(content, 120), created
--     from net._http_response order by created desc limit 5;         -- 200s, not 401/405/308
--   select count(*) from notification_outbox where kind = 'voucher_expiring';
--     -- grows on the first night a voucher sits inside a bucket
