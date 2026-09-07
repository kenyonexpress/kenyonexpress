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
--
--     MEASURED 2026-09-08, AND THE NAMES ARE NOT THE ONES THIS FILE ASSUMED.
--     The vault holds `CRON_SECRET` and `APP_BASE_URL`, seeded 2026-09-03.
--     This block asked for `cron_secret` and `app_url` and therefore returned
--     zero rows, which is why STATE.md recorded "the vault holds neither" and
--     why 162 has been marked blocked on seeding since. The secrets were there
--     the whole time under different names.
--
--     162 now reads the names that exist. EXPECT: two rows.
select name from vault.decrypted_secrets
 where name in ('CRON_SECRET', 'APP_BASE_URL')
 order by name;

-- (4) The URL the cron will call. THIS BLOCK'S RULE CHANGED, deliberately.
--
--     It used to demand `https://%.vercel.app` and forbid the live domain,
--     because when it was written the domain was dead and a cron firing at it
--     would hit nothing. Measured 2026-09-08: APP_BASE_URL is 27 characters,
--     https, and IS `kenyonexpress.co.il` -- so under the old rule this block
--     fails, and under the new reality it may be exactly right, because the
--     DNS cutover is in flight.
--
--     A preflight must not hardcode an answer that is mid-flip. So this block
--     no longer judges WHICH host is correct; it reports the shape and leaves
--     the judgement to the person applying, who knows whether DNS has landed.
--
--     EXPECT: is_https true. Then decide: if the cutover has completed, the
--     live domain is correct and 162 may apply. If it has not, seed
--     APP_BASE_URL with the *.vercel.app origin FIRST, or the twelve cron jobs
--     will fire at a host that does not answer.
select length(decrypted_secret)                          as url_length,
       decrypted_secret like 'https://%'                  as is_https,
       decrypted_secret like '%.vercel.app%'              as is_vercel_origin,
       decrypted_secret like '%kenyonexpress.co.il%'      as is_live_domain
  from vault.decrypted_secrets where name = 'APP_BASE_URL';

-- (5) OUTSIDE SQL, in the repo -- every scheduled path exists and is guarded:
--     for each of the twelve paths in scripts/cron-jobs.json,
--     src/app/api/cron/<name>/route.ts exists and rejects a missing/wrong
--     Authorization: Bearer CRON_SECRET with 401.
--     Pinned by src/__tests__/cron-schedule-inventory.test.ts and the per-route
--     auth tests; `pnpm test` green is the pass condition for this block.

-- ============================================================
-- MEASURED 2026-09-08 via MCP execute_sql, read-only:
--   vault names present : CRON_SECRET (64 chars), APP_BASE_URL (27 chars)
--   APP_BASE_URL        : https, NOT vercel, IS kenyonexpress.co.il
--
-- So 162 is NOT blocked on seeding, which is what the docs have said since
-- 2026-09-04. It is blocked on one decision: whether the DNS cutover has
-- landed, because that decides whether the seeded host answers.
-- ============================================================
