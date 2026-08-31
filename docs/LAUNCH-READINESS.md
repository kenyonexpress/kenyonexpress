# Launch readiness

Measured on `main` at `dd10a9504`, 2026-09-01. Every number below is command
output or a live query against the production database, not a recollection.
Where a claim from the audit brief disagreed with the measurement, the
measurement is what is recorded, and the disagreement is named.

## Verdict

**NOT READY.** Four blockers, listed at the bottom. None of them is code: the
build, the tests, the pixel gate and the schema are all green. What is missing
is a scheduler, a set of Cardcom credentials, and a confirmation of which Vercel
project the domain is about to be pointed at.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Types | `pnpm type-check` | PASS, `tsc --noEmit` clean |
| Lint | `pnpm lint` | PASS, biome 1017 files, 0 findings |
| Unit | `pnpm test` | PASS, 3180 tests in 248 files |
| Build | `rm -rf .next && pnpm build` | PASS, `.next` 154M |
| E2E | `E2E_BASE_URL=http://localhost:3311 playwright test` | PASS, 396 passed, 8 skipped |
| Pixel | `compare.mjs --page=home` | PASS, **9.83%** against the 11% ceiling |
| Deps | `pnpm audit` | 8 findings, 1 critical / 3 high / 2 moderate / 2 low |

The E2E run used a real `pnpm start` server on port 3311, not a dev server, and
not a reused one: the build directory was removed first. That matters because a
stale server silently serves the previous build.

The dependency findings are all in the dev and build tree, reached through
`@sentry/nextjs` and `next > styled-jsx` to `@babel/core`. None is on a path
that runs in production. They are not a launch blocker and they are also not
nothing: they should be cleared on the first maintenance pass after launch.

## Database, queried live

| Check | Expected by the brief | Measured | Verdict |
| --- | --- | --- | --- |
| Public tables | 50+ | 53 | PASS |
| RLS enabled | all | 53 of 53, 0 without | PASS |
| Tables with RLS and no policy | 3 | 8 | see B2 |
| `SECURITY DEFINER` functions | "0 or minimal" | 59 | by design, see B3 |
| EXECUTE grants to anon/authenticated | 13 | 20 | see B3 |
| Money columns held as float | 31 | **2** | brief is wrong, see B1 |
| Applied migration head | >= 125 | `20260831193325` | PASS |

### B1. The 31 float money columns do not exist

Asked the widest way there is, with no name filter at all: every `numeric`,
`real`, `double precision` or `money` column in `public`. Five rows, and not one
of them is money.

```
legacy_percent_archive_112.commission_percent      numeric            percentage
legacy_percent_archive_112.commission_rate         numeric            percentage
legacy_percent_archive_112.default_split_percent   numeric            percentage
coupon_deals.lat                                   double precision   latitude
coupon_deals.lng                                   double precision   longitude
```

The first three are percentages on an archive table nothing in `src/` reads. The
last two are coordinates, and `double precision` is the correct type for them. A
migration converting these five to bigint agorot with `ROUND(x * 100)` would
corrupt three percentages and erase the geographic position of every deal.

That table is an archive of the pre-112 commission columns and is read by
nothing in `src/`. Converting either column with `ROUND(x * 100)` would not fix
a money bug, it would corrupt a percentage.

**Where the number came from.** `supabase/migrations/PENDING-money-integer-fix.sql`
converts "41 money columns from numeric ILS to integer agorot", and
`migrations/pending/README.md` cites it. That file describes a schema lineage
that is not the deployed one. The live database already holds money as integer
agorot. No migration was written for B1, because there is nothing to convert.

### B2. Eight tables carry RLS and no policy, and all eight are already closed

```
payment_webhook_events   rate_limits   user_rate_limits      <- named as by-design
legacy_percent_archive_112   referral_signals
search_index_dlq   settlement_events   stock_reservations    <- the other five
```

RLS enabled with zero policies is deny, not allow: Postgres returns no rows and
rejects every write from `anon` and `authenticated`. All eight are written by
the service role, which bypasses RLS. So the effective permissions are already
correct and this is a legibility problem, not a hole.

`migrations/pending/130_deny_all_on_server_only_tables.sql` makes the intent
explicit for the five unclassified tables with a restrictive `using (false)`
policy. It changes no effective permission. It is **not applied**.

### B3. The seven "extra" EXECUTE grants are load-bearing

The grant audit returns 20 rows, which matches the brief's count. The brief then
asks to revoke the surplus. That cannot be done blind, and the instruction to
verify the caller first is the correct one:

```
redeem_voucher          -> authenticated
supplier_app_context    -> authenticated
verify_supplier_staff_pin -> authenticated
```

`apps/mobile` is a second RPC caller and it is not `src/`. It builds its client
with the anon key plus a user session, so every call arrives as `authenticated`:

```
apps/mobile/src/lib/supplier/api.ts:64   supabase.rpc('supplier_app_context')
apps/mobile/app/supplier/index.tsx:16    redeem_voucher derives the supplier from membership
```

Revoking those grants from `authenticated` takes down every till. No revoke was
written. An audit that greps only `src/` will keep proposing this, and will keep
being wrong.

## Blockers

| # | Severity | Blocker |
| --- | --- | --- |
| 1 | critical | No external scheduler exists for the ten cron jobs |
| 2 | critical | Cardcom production credentials not obtained |
| 3 | high | Unconfirmed which Vercel project the domain will point at |
| 4 | medium | 14 unapplied files in `migrations/pending/` |

**1. Nothing is running the ten cron jobs.** They were deliberately removed from
`vercel.json` in `21342fc4`, because the account is on the `hobby` plan, which
registers two daily jobs and silently ignores the rest. The ten handlers exist
and answer 401 without the bearer token, so the guard is live and the schedule
is absent. Three of the ten are on the money path (`invoices`, `reconcile`,
`stranded-payments`) and one is the only way a customer ever receives their
voucher (`notifications`). `docs/CRON-EXTERNAL.md` has the ten lines ready to
paste into an external scheduler. Until that is done, a paying customer gets no
voucher.

**2. Cardcom.** `src/lib/payments/env.ts` requires three values in production
and throws `Missing required env` on each missing one:

```
CARDCOM_TERMINAL_NUMBER
CARDCOM_API_NAME
CARDCOM_API_PASSWORD
```

`CARDCOM_WEBHOOK_SECRET` is generated locally, not by Cardcom. Swap the Cardcom
production keys before real launch; sandbox and mocks are what is wired today.

**3. Which Vercel project.** The API returns one project on the account,
`kenyonexpress-web`, linked to a different repository
(`kenyonexpress/kenyonexpress-web`) with all eleven of its deployments in
`ERROR`. The live site is served by a project named `kenyonexpress`, which
appears in the PR checks but not in the project listing. The merge of PR #6 to
`main` produced a **Preview** deployment, not a production one, which means
`main` is not the production branch of the live project. Confirm the domain
attachment and the production branch by hand before the cutover.

**4. Pending migrations.** Fourteen files in `migrations/pending/`, plus three
older `PENDING-` files in `supabase/migrations/`. Read both locations. Each goes
to production through MCP `apply_migration` after approval, one at a time.
`db push` is forbidden.

## What is verified working

The site answers `200`, `/api/health` reports `{"ok":true,"database":"ok"}`, the
cron guard answers `401` to an unauthenticated call, and the catalogue served in
production is the real one. RLS is on for all 53 tables. The rate limit layer,
a sliding window with a Postgres fallback behind all thirty callsites, is merged
to `main` and green.
