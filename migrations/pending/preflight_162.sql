-- preflight_162.sql -- run each block through MCP execute_sql (or the
-- management API) BEFORE 162. Every block must come back matching the
-- expectation in its comment; otherwise DO NOT apply 162 -- record the
-- failing block under "## חסמים לאופיר" in STATE.md and move on (CLOSEOUT §7b).
--
-- 2026-10-07 (STEP 39) result: (1) pass, (2) pass, (3) FAIL, (4) FAIL,
-- (5) pass, (6) FAIL (401). 162 not applied. See the file header for why the
-- failures cannot be fixed from this side without a secret rotation and a
-- production deploy, and why Vercel crons on Pro make the file redundant.

-- (1) Both extensions installed, the versions 161 recorded.
--     EXPECT: two rows -- pg_cron in pg_catalog, pg_net in extensions.
select e.extname, n.nspname, e.extversion
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname in ('pg_cron', 'pg_net');

-- (2) The scheduler holds only jobs this project knows: ke-% rows from a
--     prior 162 run (the upsert replaces them) and report_tables_nightly,
--     which 170 scheduled. EXPECT: foreign_jobs = 0.
select count(*) as total,
       count(*) filter (where jobname not like 'ke-%'
                          and jobname <> 'report_tables_nightly') as foreign_jobs
  from cron.job;

-- (3) Vault holds both secrets BY NAME (values are never selected here).
--     EXPECT: two rows, names app_url and cron_secret. The upper-case pair
--     seeded 2026-09-03 (APP_BASE_URL, CRON_SECRET) does not count: nothing
--     reads it and its secret is stale (block 6).
select name from vault.decrypted_secrets
 where name in ('cron_secret', 'app_url')
 order by name;

-- (4) app_url points at the *.vercel.app production alias, not the custom
--     domain (which challenges automated clients). EXPECT: true.
select decrypted_secret like 'https://%.vercel.app'
       and decrypted_secret not like '%kenyonexpress.co.il%' as app_url_is_vercel
  from vault.decrypted_secrets where name = 'app_url';

-- (5) OUTSIDE SQL, in the repo -- every scheduled path exists and is guarded:
--     for each of the twenty-nine paths in scripts/cron-jobs.json,
--     src/app/api/cron/<name>/route.ts exists, exports GET, and rejects a
--     missing/wrong Authorization: Bearer CRON_SECRET with 401.
--     Pinned by src/__tests__/cron-schedule-inventory.test.ts (which also
--     pins 162's job list to the manifest) and the per-route auth tests;
--     `pnpm test` green is the pass condition for this block.

-- (6) The bearer in the vault is the one production accepts. Fire ONE probe
--     from inside the database with the exact command shape 162 schedules,
--     then read the answer a few seconds later (pg_net is asynchronous).
--     EXPECT: status_code = 200. A 401 means the vault secret is not the
--     deployment's CRON_SECRET and 162 would schedule twenty-nine jobs that
--     fail every run. /api/cron/health is read-only; it pages ntfy only for a
--     dependency that is DOWN, which the scheduled job would do anyway.
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/health',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
  timeout_milliseconds := 30000) as request_id;
-- then:
-- select id, status_code, timed_out, left(content, 80) from net._http_response order by id desc limit 1;
