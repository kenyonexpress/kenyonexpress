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
| Money columns held as numeric | 31 | **32** | confirmed, see B1 |
| Applied migration head | >= 125 | `20260831193325` | PASS |

### B1. RETRACTED. The audit was right and this document was wrong

**An earlier revision of this file claimed the finding was false. That claim came
from a broken query and it has been withdrawn.** The query filtered with
`format_type(atttypid, atttypmod) in ('numeric', ...)`. `format_type` returns
`numeric(12,2)` for a precision-qualified column, which is not the string
`numeric`, so the test silently skipped every money column in the database and
returned only the five columns that happen to carry no precision. Re-run against
`pg_type.typname` instead:

```
numeric/float columns in public : 74
  money-like                    : 32
  percent-like                  : 25
  true floats (float4/float8)   :  2   (coupon_deals.lat, coupon_deals.lng)
```

The audit's count of 31 was substantially correct. Thirty-two money columns are
held as `numeric`, across fifteen tables:

| Table | Money columns held as numeric |
| --- | --- |
| `products` | `price_ils`, `coupon_price_ils`, `cost_ils`, `full_price`, `kenyon_price`, `compare_at_price`, `compare_at_price_ils` |
| `order_items` | `unit_price_ils`, `total_price_ils`, `supplier_payout_ils`, `coupon_price_ils` |
| `orders` | `subtotal_ils`, `total_ils`, `discount_ils` |
| `product_variants` | `price`, `price_ils`, `price_modifier` |
| `coupon_codes` | `collect_amount_ils`, `face_value_ils` |
| `coupon_deals` | `original_price`, `platform_price` |
| `coupons` | `discount_value`, `original_price` |
| `wallet_transactions` | `amount_ils`, `gross_amount_ils` |
| `wallet_accounts` | `balance_ils` |
| `wallet_balances` | `balance_ils` |
| `wallet_entries` | `amount_ils` |
| `payments` | `amount_ils` |
| `profiles` | `wallet_balance` |
| `affiliates` | `total_earnings_ils` |
| `referrals` | `bonus_paid_amount_ils` |

**One word in the finding is still wrong, and it matters for severity.** These
are `numeric(p,s)`, not floats. `numeric` is exact decimal: it has no binary
rounding error, so there is no money currently being lost to floating point.
Only two true floats exist in the schema and both are coordinates, where
`double precision` is correct. So this is a **standards and dual-representation**
problem, not live corruption.

The real hazard is that the same tables carry both representations at once.
`order_items` holds `total_price_ils numeric(12,2)` beside `commission_agorot
integer`, `face_value_agorot`, `paid_on_site_agorot` and six more. Two sources of
truth for the same money, with no constraint tying them together, is how a
rounding disagreement becomes a payout dispute.

`migrations/pending/131` through `135` carry the conversion. They are **additive
and unapplied**: each adds an `_agorot bigint` column, backfills it with
`round(x * 100)`, and constrains it, leaving the existing column in place so no
current reader breaks. Rewriting the readers is the follow-up, and cutting the
old columns is the step after that. Rationale recorded in `docs/DECISIONS.md`.

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
