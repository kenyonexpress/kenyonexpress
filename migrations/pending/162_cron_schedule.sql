-- 162_cron_schedule.sql (idempotent)
--
-- NOT APPLIED. Approved by Ofir 2026-09-04 (CLOSEOUT §7) when no deployment
-- existed and the Vercel plan was Hobby. RE-MEASURED 2026-10-07 (STEP 39) and
-- STILL NOT APPLIED, for three reasons that are each sufficient on their own:
--
--   1. Its preflight fails. The vault holds an UPPER-CASE pair seeded on
--      2026-09-03 (`CRON_SECRET`, `APP_BASE_URL`), not the names this file
--      reads, and that CRON_SECRET is wrong: a `net.http_get` from inside
--      production to `/api/cron/health` with that bearer answered 401
--      (net._http_response id 1). `APP_BASE_URL` is the custom domain, which
--      challenges busy clients, not the *.vercel.app alias block (4) requires.
--      Seeding the right value is impossible from anywhere: the Vercel
--      production `CRON_SECRET` is type `sensitive` (unreadable after
--      creation, re-set 2026-09-16), every local .env across eleven worktrees
--      holds only the .env.example placeholder (401), and the GitHub Actions
--      secret from 02.09 has failed 40/40 scheduled runs with 401 since 10.09.
--      Honest seeding therefore means ROTATING the secret, and a rotated
--      secret reaches the running functions only through a production deploy,
--      which is one of the four stop conditions.
--   2. It is superseded. The team is on Vercel Pro (measured: `billing.plan`
--      = pro), HEAD's `vercel.json` declares all 29 jobs, and the explicit goal
--      of 2026-09-10 (commit 337c4a8b8) chose Vercel crons as the scheduler,
--      pinned byte-for-byte to scripts/cron-jobs.json by
--      cron-schedule-inventory.test.ts. Vercel crons send the same bearer from
--      the deployment's own CRON_SECRET, so they need no vault, no pg_net and
--      no rotation. The production deployment of 06.10 registered 0 crons only
--      because audit/final-audit's vercel.json has no `crons` key (measured on
--      1e84df0e5); the first deploy of a branch that carries the key registers
--      all 29. Applying this file on top of that is a second scheduler calling
--      every job twice.
--   3. It was stale: it named 12 of the 29 manifest jobs and used
--      `net.http_post` against routes that export GET only (all 29 routes,
--      measured). The body below is regenerated from scripts/cron-jobs.json
--      and pinned to it by cron-schedule-inventory.test.ts, so if the
--      scheduler decision is ever reversed in favour of pg_cron this file is
--      one preflight away and cannot lie about the job list again.
--
-- The unblock, in order, needs no part of this file:
--   a. Rotate CRON_SECRET once (openssl rand -hex 32) into the Vercel
--      production env of project `kenyonexpress` AND the GitHub Actions
--      secret, same value.
--   b. Deploy a commit whose vercel.json carries the `crons` key (HEAD does).
--      Pro registers all 29, bearer = the deployment's CRON_SECRET.
--   c. Set the GitHub variable CRON_SCHEDULER_ENABLED to anything but `true`
--      first, or every job runs twice.
--
-- SECRETS ARE NOT INLINED. Each job command looks the secret and the base URL
-- up from vault at RUN time:
--   (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--   (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
-- so `cron.job.command` never stores either value, rotating the secret needs
-- no re-migration, and a missing vault row makes the job fail loudly instead
-- of calling with an empty bearer. `app_url` must be the *.vercel.app
-- production alias (https://kenyonexpress.vercel.app serves production and
-- does not challenge automated clients; the custom domain does).
--
-- IDEMPOTENT: cron.schedule(jobname, ...) upserts by name in pg_cron >= 1.4,
-- so re-running replaces the schedule instead of duplicating it. It leaves
-- `report_tables_nightly` (170) alone: that job is not a ke-% job.
--
-- ROLLBACK (whole file):
--   select cron.unschedule(jobname) from cron.job where jobname like 'ke-%';

do $$
declare
  job record;
begin
  -- Refuse to schedule jobs that would call with a missing secret or URL.
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret') then
    raise exception '162: vault secret cron_secret missing; seed it first (preflight_162 block 3)';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'app_url') then
    raise exception '162: vault secret app_url missing; seed it first (preflight_162 block 3)';
  end if;

  -- The 29 jobs of scripts/cron-jobs.json, in manifest order. Generated,
  -- not typed: cron-schedule-inventory.test.ts fails if this block and the
  -- manifest disagree on a name, a schedule or a path.
  for job in
    select * from (values
      ('ke-notifications',       '*/5 * * * *',  '/api/cron/notifications'),
      ('ke-health',              '*/5 * * * *',  '/api/cron/health'),
      ('ke-invoices',            '*/10 * * * *', '/api/cron/invoices'),
      ('ke-stock',               '*/10 * * * *', '/api/cron/stock'),
      ('ke-stranded-payments',   '*/10 * * * *', '/api/cron/stranded-payments'),
      ('ke-webhook-dlq',         '*/10 * * * *', '/api/cron/webhook-dlq'),
      ('ke-job-dlq',             '*/10 * * * *', '/api/cron/job-dlq'),
      ('ke-abandoned-cart',      '0 * * * *',    '/api/cron/abandoned-cart'),
      ('ke-subscriptions',       '30 2 * * *',   '/api/cron/subscriptions'),
      ('ke-reap-carts',          '40 3 * * *',   '/api/cron/reap-carts'),
      ('ke-reconcile',           '0 4 * * *',    '/api/cron/reconcile'),
      ('ke-expire-vouchers',     '15 23 * * *',  '/api/cron/expire-vouchers'),
      ('ke-expire-cashback',     '15 23 * * *',  '/api/cron/expire-cashback'),
      ('ke-whatsapp',            '*/5 * * * *',  '/api/cron/whatsapp'),
      ('ke-search-outbox',       '*/10 * * * *', '/api/cron/search-outbox'),
      ('ke-search-reindex',      '0 * * * *',    '/api/cron/search-reindex'),
      ('ke-retention',           '0 5 1 * *',    '/api/cron/retention'),
      ('ke-weekly-digest',       '0 4 * * 5',    '/api/cron/weekly-digest'),
      ('ke-expire-coupons',      '15 23 * * *',  '/api/cron/expire-coupons'),
      ('ke-backup',              '20 2 * * *',   '/api/cron/backup'),
      ('ke-wishlist-alerts',     '45 4 * * *',   '/api/cron/wishlist-alerts'),
      ('ke-wishlist-digest',     '0 5 * * 5',    '/api/cron/wishlist-digest'),
      ('ke-daily-deals',         '0 3 * * *',    '/api/cron/daily-deals'),
      ('ke-email-retry',         '30 */6 * * *', '/api/cron/email-retry'),
      ('ke-cashback-settlement', '45 23 * * *',  '/api/cron/cashback-settlement'),
      ('ke-slow-statements',     '30 2 * * *',   '/api/cron/slow-statements'),
      ('ke-sitemap-regen',       '0 3 * * *',    '/api/cron/sitemap-regen'),
      ('ke-analytics-rollup',    '30 2 * * *',   '/api/cron/analytics-rollup'),
      ('ke-log-cleanup',         '30 */6 * * *', '/api/cron/log-cleanup')
    ) as t(jobname, schedule, path)
  loop
    -- GET, not POST: every src/app/api/cron/*/route.ts exports GET only.
    perform cron.schedule(
      job.jobname,
      job.schedule,
      format(
        $cmd$
        select net.http_get(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || %L,
          headers := jsonb_build_object(
            'Authorization',
            'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          timeout_milliseconds := 55000
        );
        $cmd$,
        job.path
      )
    );
  end loop;
end
$$;
