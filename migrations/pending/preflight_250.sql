-- preflight_250.sql -- run each block read-only BEFORE 250.
-- Every block must come back matching the expectation in its comment;
-- otherwise DO NOT apply 250 -- record the failing block in STATE.md under
-- the open blockers and move on.

-- (1) Both extensions installed. EXPECT: pg_cron 1.6.x in pg_catalog,
--     pg_net 0.20.x in extensions (measured 2026-10-05: 1.6.4 / 0.20.0).
select e.extname, n.nspname, e.extversion
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname in ('pg_cron', 'pg_net');

-- (2) pg_net exposes http_get with a headers argument. EXPECT: one row whose
--     arguments include "headers jsonb".
select p.proname, pg_get_function_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'net' and p.proname = 'http_get';

-- (3) The scheduler holds nothing under these three names yet, or holds them
--     from a prior 250 run (the upsert replaces them). EXPECT: 0 rows, or only
--     the three ke-% names this file owns.
select jobname, schedule, left(command, 60) as command
  from cron.job
 where jobname in ('ke-expire-vouchers', 'ke-notifications', 'ke-cron-history-prune');

-- (4) Vault holds both secrets BY NAME (values are never selected here).
--     EXPECT: two rows, APP_BASE_URL and CRON_SECRET.
select name from vault.decrypted_secrets
 where name in ('CRON_SECRET', 'APP_BASE_URL')
 order by name;

-- (5) APP_BASE_URL is https and NOT the apex host. EXPECT: true, false.
--     Measured 2026-10-05: true, TRUE -- the apex answers 308 to www and the
--     bearer does not survive the redirect. Re-seed before applying:
--       select vault.update_secret(
--         (select id from vault.secrets where name = 'APP_BASE_URL'),
--         'https://www.kenyonexpress.co.il');
select decrypted_secret like 'https://%' as is_https,
       split_part(substring(decrypted_secret from 9), '/', 1) = 'kenyonexpress.co.il' as is_apex
  from vault.decrypted_secrets where name = 'APP_BASE_URL';

-- (6) The target host answers the route with 401 on GET without a bearer and
--     405 on POST (so http_get is the right verb). OUTSIDE SQL:
--       curl -s -o /dev/null -w '%{http_code}\n' https://www.kenyonexpress.co.il/api/cron/health            # 401
--       curl -s -o /dev/null -w '%{http_code}\n' -X POST https://www.kenyonexpress.co.il/api/cron/health    # 405
--     Measured 2026-10-05: 401 / 405.

-- (7) CRON_SECRET in the vault equals CRON_SECRET in Vercel Production. Not
--     readable from here (the Vercel value is Sensitive). The first run tells:
--     a 401 in net._http_response means the two differ, and the fix is one
--     vault.update_secret, not a migration.
