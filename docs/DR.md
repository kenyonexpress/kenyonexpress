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
