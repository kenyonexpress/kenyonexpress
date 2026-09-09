-- 162_cron_schedule.sql (idempotent)
--
-- NOT APPLIED. Approved by Ofir 2026-09-04 (CLOSEOUT §7) as the ONLY migration
-- cleared for production; it still goes through MCP `apply_migration`, one
-- statement batch, after preflight_162.sql passes. `db push` stays forbidden.
--
-- Schedules the twelve jobs of scripts/cron-jobs.json -- the single source of
-- truth the inventory test pins -- through pg_cron + pg_net, which 161
-- installed (pg_cron 1.6.4 in pg_catalog, pg_net 0.20.0 in extensions).
--
-- SECRETS ARE NOT INLINED. Each job command looks the secret and the base URL
-- up from vault at RUN time:
--   (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--   (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
-- so `cron.job.command` never stores either value, rotating the secret needs
-- no re-migration, and a missing vault row makes the job fail loudly instead
-- of calling with an empty bearer. `app_url` is the *.vercel.app production
-- alias, NOT the domain: DNS is not live (CLOSEOUT §8a).
--
-- IDEMPOTENT: cron.schedule(jobname, ...) upserts by name in pg_cron >= 1.4,
-- so re-running replaces the schedule instead of duplicating it.
--
-- ROLLBACK (whole file):
--   select cron.unschedule(jobname) from cron.job where jobname like 'ke-%';

do $$
declare
  job record;
begin
  -- Refuse to schedule jobs that would call with a missing secret or URL.
  if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret') then
    raise exception '162: vault secret cron_secret missing; seed it first (CLOSEOUT §8a)';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'app_url') then
    raise exception '162: vault secret app_url missing; seed it first (CLOSEOUT §8a)';
  end if;

  for job in
    select * from (values
      ('ke-notifications',      '*/5 * * * *',  '/api/cron/notifications'),
      ('ke-health',             '*/5 * * * *',  '/api/cron/health'),
      ('ke-invoices',           '*/10 * * * *', '/api/cron/invoices'),
      ('ke-stock',              '*/10 * * * *', '/api/cron/stock'),
      ('ke-stranded-payments',  '*/10 * * * *', '/api/cron/stranded-payments'),
      ('ke-abandoned-cart',     '0 * * * *',    '/api/cron/abandoned-cart'),
      ('ke-subscriptions',      '30 2 * * *',   '/api/cron/subscriptions'),
      ('ke-reap-carts',         '40 3 * * *',   '/api/cron/reap-carts'),
      ('ke-reconcile',          '0 4 * * *',    '/api/cron/reconcile'),
      ('ke-expire-vouchers',    '15 23 * * *',  '/api/cron/expire-vouchers'),
      ('ke-retention',          '0 5 1 * *',    '/api/cron/retention'),
      ('ke-weekly-digest',      '0 4 * * 5',    '/api/cron/weekly-digest')
    ) as t(jobname, schedule, path)
  loop
    perform cron.schedule(
      job.jobname,
      job.schedule,
      format(
        $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || %L,
          headers := jsonb_build_object(
            'Authorization',
            'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 55000
        );
        $cmd$,
        job.path
      )
    );
  end loop;
end
$$;
