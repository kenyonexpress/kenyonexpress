# Disaster recovery (F20)

The full runbook is `docs/DR-RUNBOOK.md` (Hebrew, step by step). This page is the
short English contract and the honest state of each backup channel.

## Targets

RTO under 2 hours. RPO up to 24 hours (daily platform backup).

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

## Channels, as measured 2026-10-16

| Channel | State |
|---|---|
| Supabase daily backup | Platform feature on the Pro plan; verify in the dashboard before relying on it |
| PITR | Paid add-on, off |
| Repo tarball with `.git` | Daily to `~/Desktop`, last three kept (maintenance rule) |
| Git remote | Every push |
| R2 nightly dump and media copy | NOT RUNNING. R2 is not enabled on the Cloudflare account, so there is no bucket to write to. Enable R2, create the bucket and credentials, then add the nightly job |

## What is tested

`supabase/tests/` holds pgTAP tests. Run them with `supabase test db` against a
local stack or a branch database, never against production.
`tests/sql/` holds the older psql assertion harnesses used by `pnpm test:rls`.
