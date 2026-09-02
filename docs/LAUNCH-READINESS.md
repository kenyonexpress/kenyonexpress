# Launch readiness


> <!-- v1-final-historical:2026-09-01 -->
> 🕯️ **Historical snapshot. Not current guidance.**
>
> This is a launch-readiness assessment, true on the date it carries. It is kept as a record of what
> was measured and decided then, and it is **not** maintained against
> production. Numbers, table names and statuses in it may since have changed.
>
> For the current state see `docs/ARCHITECTURE-OVERVIEW.md`, and
> `docs/INDEX.md` for which document is authoritative on a given subject.

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
| RLS enabled | all | 61 of 61, 0 without | PASS |
| Tables with RLS and no policy | 3 | 8 | see B2 |
| `SECURITY DEFINER` functions | "0 or minimal" | 61 of 69 | by design, see B3 |
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

`migrations/pending/122_deny_all_on_server_only_tables.sql` makes the intent
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
production is the real one. RLS is on for all 61 tables. The rate limit layer,
a sliding window with a Postgres fallback behind all thirty callsites, is merged
to `main` and green.

## Production smoke, 2026-09-02

Run against `https://kenyonexpress.vercel.app` from this machine.

| Path | Status | Time | Bytes |
| --- | --- | --- | --- |
| `/` | 200 | 4.89s | 379,811 |
| `/products` | 200 | 2.22s | 217,874 |
| `/sitemap.xml` | 200 | 0.84s | 12,893 |
| `/robots.txt` | 200 | 0.83s | 342 |
| `/checkout` | 200 | 2.08s | 74,853 |
| `/cart` | 200 | 0.95s | 67,385 |

All ten cron endpoints answer **401**, which is the correct answer and the
useful one: the routes are deployed and `CRON_SECRET` is set in production. A
404 would have meant the routes were missing; a 200 would have meant the secret
was not being checked.

```
notifications 401   health 401   invoices 401   stock 401
stranded-payments 401   abandoned-cart 401   subscriptions 401
reap-carts 401   reconcile 401   expire-vouchers 401
```

### `/checkout` returning 200 does not mean checkout works

The launch brief expects `/checkout` to stop returning "404/disabled" once
`CHECKOUT_ENABLED=true` is set. It was never going to return either. The page
renders regardless, with `<title>תשלום | קניון אקספרס</title>` and no
disabled-state text in the body.

`CHECKOUT_ENABLED` gates the **server action**, not the page:

```
src/server/actions/payments/checkout.ts:252   if (!env.checkoutEnabled) { ... }
src/lib/payments/env.ts:76                    NODE_ENV === 'production'
                                                ? CHECKOUT_ENABLED === 'true'
                                                : CHECKOUT_ENABLED !== 'false'
```

It fails **closed** in production: unset means payments are refused. So the
observable symptom of the variable being unset is not a 404 on the page, it is a
customer filling in the whole form and being refused at submit. A smoke test
that only fetches `/checkout` cannot see it, and the only honest check is either
reading the variable in the Vercel dashboard or driving a real submit.

Two cron routes carry the same gate (`reconcile`, `stranded-payments`), so they
no-op while it is unset even though they answer 401 to an unauthenticated call.

### Front page timing

4.89s to first byte-through-completion on a cold path is slow enough to be worth
a look before launch, though it is one sample from one machine over the public
internet and is not a Lighthouse measurement.

## Visual gate, 2026-09-02

Measured against a clean `pnpm build` on a server started for the run, so no
stale-server reading. Ceiling is 11%.

| Page | 1440 | 768 | 380 |
| --- | --- | --- | --- |
| home | **9.83%** | 40.81% | 42.44% |
| cart | **8.60%** | 14.17% | 19.74% |
| checkout | **9.72%** | 13.11% | 14.64% |
| product | refused | refused | refused |

**1440 passes on every page that can be measured. 768 and 380 fail on every
page.** This is not a regression: those two widths had never been measured
before this week, because `compare.mjs` hung on them. Every three-width figure
ever quoted for this gate was a 1440 figure.

`home` at 380 additionally trips the script's own structural guard — live is
17,825px tall against our 10,358px, a ratio of 0.58 — and the script says so
itself: at that ratio the percentage is not a pixel gate, it is two different
pages. So the mobile numbers are a statement that the mobile layouts diverge
structurally from live, not a styling delta anyone can close by moving tokens.

`product` refuses at every width and the refusal is correct: live renders **1**
related-product card and our page renders **4**. That is a catalogue difference
wearing a fidelity number, which is exactly what the guard exists to stop.

`account` and `supplier` were not measured: the live site has no comparable
authenticated pages to score against.

### What this means for launch

The 11% gate is met at desktop and is nowhere near met at mobile. Closing the
mobile gap is a layout project, not a tuning pass, and it is the largest single
piece of work left. Most Israeli shoppers are on mobile.

## Quality gates, 2026-09-02

```
pnpm type-check   clean
pnpm biome check  984 files, no findings
pnpm test         3478 passed, 258 files
pnpm build        green
```

## BLOCKER: production checkout is enabled and wired to the mock provider

Found 2026-09-02, by reading the production environment directly after
`vercel link`. Both facts are from `vercel env pull --environment=production`.

```
CHECKOUT_ENABLED = "true"
CARDCOM_USE_MOCK = "true"
```

`CHECKOUT_ENABLED=true` was **already set** — the launch task to add it was
done a day earlier. The dangerous variable is the other one.

`src/lib/payments/env.ts:61`:

```js
const useMock =
  source.CARDCOM_USE_MOCK === 'true' ||
  source.NODE_ENV === 'test' ||
  (!source.CARDCOM_TERMINAL_NUMBER && source.NODE_ENV !== 'production')
```

`CARDCOM_USE_MOCK === 'true'` is tested first and **there is no production
override**. So `getPaymentProvider()` returns `getSharedMockCardcom()`, and the
mock answers `success: true` to `createLowProfile`, `verifyLowProfile`,
`chargeWithToken` and `refundByTransactionId` alike.

**A customer would complete checkout, the payment would "succeed", the order
would finalize and a voucher would be issued, and no card would ever be
charged.** The shop would give away goods.

There are also no real terminal credentials in production. The only Cardcom
variables present are `CARDCOM_USE_MOCK` and `CARDCOM_WEBHOOK_SECRET`;
`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME` and `CARDCOM_API_PASSWORD` are
absent.

### Why this was not fixed here

Deleting `CARDCOM_USE_MOCK` on its own makes it **worse, not better**. The
non-mock branch calls `required('CARDCOM_TERMINAL_NUMBER', ...)`, which throws
when the variable is missing, so checkout would move from silently-fake to
hard-failing.

The two changes are one change and they are Ofir's:

1. add `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   from the production terminal (Cardcom, 03-9436100), then
2. remove `CARDCOM_USE_MOCK`, then
3. redeploy, then place one real low-value order and confirm it appears in the
   Cardcom dashboard.

**Until then, the safe state is `CHECKOUT_ENABLED=false`.** A checkout that
refuses is a bad shop; a checkout that fakes success is a shop that ships goods
for free. That flip was not made here because the launch instruction was
explicitly to set it to `true`, and choosing the opposite is a business call.

**This is a DNS-cutover blocker.** Pointing the real domain at this deployment
today would open a shop that charges nobody.

## v1.1.0 closeout, 2026-09-02

Gates at the tag: 3539 vitest passed, type-check clean, biome clean (984
files), build green. Branch `release/v1.1` (= `closeout/v1-final` tip), PR into
main open; merging is Ofir's hard stop.

### The recurring finding of this closeout

Five whole subsystems existed on one side of the wire only, every one now
closed: payment_events (table, no writers -> wired), refunds (statutory table,
no writers -> wired), subscriptions (renewal+cancel, no creator -> built),
analytics ingest (caller, no function -> 151), payouts (four verbs + page, no
tables/functions -> 152).

### migrations/pending — 29 files, apply through MCP in APPLY-ORDER.md order

- 122_deny_all_on_server_only_tables.sql
- 123_products_whatsapp_enabled.sql
- 124_categories_sort_order.sql
- 125_expire_vouchers_drop_escrow.sql
- 126_percent_range_checks.sql
- 127_homepage_cms.sql
- 130_payment_events.sql
- 131_refunds.sql
- 132_search_index_outbox.sql
- 133_supplier_branches.sql
- 134_order_items_delivered_at.sql
- 135a_product_type_recurring.sql
- 135b_recurring_subscriptions.sql
- 136_supplier_coordinates.sql
- 137_order_transition_guard.sql
- 138_money_agorot_money_path.sql
- 139_money_agorot_wallet.sql
- 140_money_agorot_catalog.sql
- 141_money_agorot_growth.sql
- 143_revoke_unused_definer_execute.sql
- 144_revoke_authenticated_dml.sql
- 145_revoke_check_rate_limit_execute.sql
- 146_wallet_balance_floor.sql
- 147_money_agorot_remaining_twins.sql
- 148_refund_destination.sql
- 149_audit_log_append_only.sql
- 150_account_deletion.sql
- 151_analytics_ingest.sql
- 152_payout_machinery.sql

The six from this closeout (147-152) each carry a rolled-back dry run against
production in their headers. None is applied. 122-146: see APPLY-ORDER.md.

### No longer manual: the cron scheduler

Armed and verified 2026-09-02: repository secret + master-switch variable set,
one dispatched health run green against production. The ten jobs now run from
GitHub Actions (best-effort timing; see cron.yml's own header).

### Still manual for Ofir

Cardcom prod terminal + removing CARDCOM_USE_MOCK (**the blocker** -- checkout
is live against the mock), DNS
cutover (the editable zone is NOT the serving zone), merging the release PR,
the 14 wrong product slugs, and the 768/380 mobile layout project.
