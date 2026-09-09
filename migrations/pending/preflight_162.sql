-- preflight_162.sql -- run each block through MCP execute_sql BEFORE 162.
-- Every block must come back matching the expectation in its comment;
-- otherwise DO NOT apply 162 -- record the failing block under
-- "## חסמים לאופיר" in STATE.md and move on (CLOSEOUT §7b).

-- (1) Both extensions installed, the versions 161 recorded.
--     EXPECT: two rows -- pg_cron in pg_catalog, pg_net in extensions.
select e.extname, n.nspname, e.extversion
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname in ('pg_cron', 'pg_net');

-- (2) The scheduler is empty (or holds only ke-% rows from a prior 162 run,
--     which the upsert will replace). EXPECT: 0, or only jobname like 'ke-%'.
select count(*) as total,
       count(*) filter (where jobname not like 'ke-%') as foreign_jobs
  from cron.job;

-- (3) Vault holds both secrets BY NAME (values are never selected here).
--     EXPECT: two rows, names cron_secret and app_url.
select name from vault.decrypted_secrets
 where name in ('cron_secret', 'app_url')
 order by name;

-- (4) app_url points at *.vercel.app, not the dead domain. EXPECT: true.
select decrypted_secret like 'https://%.vercel.app'
       and decrypted_secret not like '%kenyonexpress.co.il%' as app_url_is_vercel
  from vault.decrypted_secrets where name = 'app_url';

-- (5) OUTSIDE SQL, in the repo -- every scheduled path exists and is guarded:
--     for each of the twelve paths in scripts/cron-jobs.json,
--     src/app/api/cron/<name>/route.ts exists and rejects a missing/wrong
--     Authorization: Bearer CRON_SECRET with 401.
--     Pinned by src/__tests__/cron-schedule-inventory.test.ts and the per-route
--     auth tests; `pnpm test` green is the pass condition for this block.
