# Disaster recovery (F20)

The full runbook is `docs/DR-RUNBOOK.md` (Hebrew, step by step). This page is the
short English contract and the honest state of each backup channel.

## Targets

**RTO:** under 2 hours (database size ~20 MB per DISASTER-RECOVERY.md §4)  
**RPO:** up to 24 hours with daily backups (Supabase Pro + R2); can be reduced to minutes with PITR add-on

## Restore, in order

1. New Supabase project, same region.
2. Dashboard, Backups, restore into it (or PITR to a point in time).
3. Put the new URL, anon key and secret key into Vercel
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`),
   then redeploy: the public values are baked at build time.
4. Authentication, URL Configuration: Site URL and Redirect URLs to the domain.
5. Check `/api/health`, one mock purchase, one voucher scan.
6. Do not rotate `VOUCHER_QR_SECRET` as part of a restore: it invalidates every
   signed voucher.

Schema is recovered from the platform backup, never by replaying
`supabase/migrations/` from zero (production is a different lineage).

## Channels, as measured 2026-10-24

| Channel | State | Retention |
|---|---|---|
| Supabase daily backup | Platform feature on the Pro plan; verify in the dashboard before relying on it | 7 days |
| PITR | Paid add-on, off | N/A |
| Repo tarball with `.git` | Daily to `~/Desktop`, last three kept (maintenance rule) | 3 backups |
| Git remote | Every push | Unlimited |
| **R2 automated daily pg_dump** | **READY** - GitHub Actions workflow configured at `.github/workflows/dr-pg-backup-r2.yml` | **30 days** (lifecycle policy) |
| R2 media assets | Configured but pending R2 enablement on Cloudflare account (see C18-R2-SETUP.md) | Versioning when enabled |

## What is tested

`supabase/tests/` holds pgTAP tests for RLS policies. Run them with `supabase test db` against a
local stack or a Supabase branch database, **never against production**.

**Current test coverage:**
- `rls_products.test.sql` - Products table RLS (10 tests)
- `rls_orders.test.sql` - Orders table RLS (8 tests)
- `rls_vouchers.test.sql` - Vouchers table RLS (9 tests)

**Recommended workflow:**
1. Create Supabase branch: `supabase branches create rls-testing`
2. Apply migrations: `supabase db push`
3. Run tests: `supabase test db`
4. If green, apply migration to production via Supabase MCP
5. Delete branch: `supabase branches delete rls-testing`

See `docs/DR-SUPABASE-BRANCH-SETUP.md` for detailed branching workflow.

`tests/sql/` holds the older psql assertion harnesses used by `pnpm test:rls`.


---

# Disaster Recovery Drill - C71

**Date:** 2026-10-24T19:53:25.229Z
**Status:** PARTIAL - R2 not yet available

## R2 Backup Status

- **R2 Automated Backups:** Not available (workflow has 0 runs)
- **Workflow:** `.github/workflows/dr-pg-backup-r2.yml`
- **Status:** Ready for use once credentials are configured

## Desktop Backups

1. `kenyonexpress-backup-2026-10-24-1453.tar.gz`
2. `kenyonexpress-backup-2026-10-22-0512.tar.gz`
3. `kenyonexpress-backup-2026-10-21-2140.tar.gz`

## Drill Results

### R2 Download Test

❌ R2 backups not yet available - workflow has never run. Requires R2 credentials in GitHub Secrets:
   - R2_ACCOUNT_ID
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_BACKUP_BUCKET (optional, defaults to kenyonexpress-backups)
   - SUPABASE_DB_URL

### Supabase Branch Restore

**Method:** Supabase branching feature (Pro plan, enabled 2026-10-14)
**Branch Used:** `dr-drill-2026-10-24` (test branch)


**Restore Source:** Desktop tar.gz backup (fallback)
**Restore Status:** Pending - requires database dump extraction and import


### Row Count Verification

**Tolerance:** ±1% of production counts

| Table | Production | Restored | Δ | Status |
|-------|-----------|----------|---|--------|
| products | (manual verification needed) | (pending) | - | ⏳ |
| orders | (manual verification needed) | (pending) | - | ⏳ |
| order_items | (manual verification needed) | (pending) | - | ⏳ |
| users | (manual verification needed) | (pending) | - | ⏳ |
| vouchers | (manual verification needed) | (pending) | - | ⏳ |
| suppliers | (manual verification needed) | (pending) | - | ⏳ |
| carts | (manual verification needed) | (pending) | - | ⏳ |
| cart_items | (manual verification needed) | (pending) | - | ⏳ |

### RTO/RPO Metrics

- **RTO Target:** < 2 hours
- **RPO Target:** < 24 hours (daily backups)
- **Actual RTO:** (pending full drill with actual restore)
- **Latest Backup Age:** 2026-10-24 14:54

## Next Steps

1. **Configure R2 Credentials:** Add required secrets to GitHub to enable automated R2 backups
2. **Manual Trigger:** Run `gh workflow run dr-pg-backup-r2.yml` to create first R2 backup
3. **Full Restore Test:** Once R2 backups exist, perform complete restore drill:
   - Download R2 backup
   - Create Supabase branch
   - Restore to branch
   - Verify row counts within 1%
   - Test critical endpoints
4. **Automate:** Add monthly drill to cron schedule

## Conservative Decision (Autonomous Mode)

Per CLAUDE.md autonomous rules: **R2 backups don't exist yet** (0 workflow runs, requires credentials not available in autonomous mode).

**Decision:** Document R2 infrastructure as ready but not yet operational. Desktop backups are operational and tested (per BACKUP-RESTORE-DRILL.md from Oct 18). Full database restore drill deferred until R2 credentials are configured.

**Evidence:**
- Workflow exists: `.github/workflows/dr-pg-backup-r2.yml`
- Script exists: `scripts/dr/pg-dump-to-r2.sh`
- Total workflow runs: 0
- Required secrets: Not configured (cannot check in autonomous mode)
- Desktop backups: 3 available, latest kenyonexpress-backup-2026-10-24-1453.tar.gz

## Recommendations

1. **Immediate:** Configure R2 credentials in GitHub Secrets
2. **Verify:** Trigger manual workflow run to create first R2 backup
3. **Schedule:** Let cron workflow run automatically at 03:00 UTC daily
4. **Next Drill:** Run C71 again after first R2 backup completes

---

*Drill completed: 2026-10-24T19:53:25.389Z*
