# ARCHITECTURE-OVERVIEW.md

The whole KenyonExpress system in one document, written for somebody who has
never opened this repository.

Measured against `main` at commit `7bf79b45c` (2026-09-01). Every count and
every table name below was read out of the code or out of a measured artifact
on that commit, not carried over from an older document. Section 9 says how to
re-derive each one.

---

## 0. What the product is

KenyonExpress is a Hebrew, right-to-left Israeli marketplace. A customer buys a
**coupon** (a prepaid voucher) for a product or service, pays online through
Cardcom, and receives a QR code. Later they walk into the supplier's business
and the supplier scans that QR code to redeem it. Money moves in two stages,
which is the single fact that shapes most of the system: the customer pays up
front, the supplier is paid only once the voucher is actually scanned.

The catalogue also carries ordinary physical products and services, but the
coupon path is the one the architecture is built around.

---

## 1. Read this before you trust any schema document

**There are three different database schemas in this repository, and most of the
older documents silently mix them up.** This is the most common way to be wrong
about this system, so it comes first.

| # | What it is | Where it lives | Size |
|---|---|---|---|
| 1 | **Production**, as measured | `supabase/rls-manifest.json` | **53 tables** |
| 2 | The **intended** schema, largely unapplied | `supabase/migrations/*.sql` | 115 files, ~101 tables |
| 3 | **Pending**, awaiting Ofir's approval | `migrations/pending/*.sql` | 24 files, numbered 122 to 146 |

`supabase/migrations/` does **not** describe the live database. It describes a
different, larger lineage. Fifty-two tables named in those files do not exist in
production at all, including every table in the double-entry ledger design
(`ledger_journals`, `ledger_journal_lines`, `ledger_accounts`), the payout
statement chain (`supplier_payouts`, `payout_statements`, `payout_statement_lines`),
`commission_ledger`, `settlement_batches`, the whole `analytics_events` family,
and the whole `agent_*` family.

Five tables run in production that no migration file creates:
`abandoned_cart_nudges`, `email_suppressions`, `legacy_percent_archive_112`,
`newsletter_subscribers`, `supplier_leads`.

`src/types/database.ts` is generated from production, but it is **partial**: it
types 33 of the 53 live tables. Twenty real production tables are missing from
it, `invoices`, `notification_outbox`, `seo_redirects`, `stock_reservations`,
`settlement_events`, `push_tokens` and `search_events` among them. Code that
touches those reaches them without generated types.

The application knows it is running ahead of its own database, and compensates
in two named places, both worth reading before you change anything on the
purchase path:

- `src/lib/supabase/optional-columns.ts` swallows exactly Postgres error 42703
  (undefined column) for columns that migration 054 adds and production does not
  have (`products.coupon_price_ils`, `products.offer_valid_until`). Without it,
  naming either column fails the entire query and the shop cannot take an order.
- `src/lib/supabase/pending-schema.ts` hand-declares the row types migration 135
  would add, so subscription code type-checks without editing the generated file.

One consequence to be aware of rather than surprised by: `src/lib/idempotency.ts`
reads and writes `idempotency_keys`, and that table is in the migration files
(060) but **not** in the last measured production snapshot (2026-08-20). Those
calls throw on error rather than degrading. Re-measure before relying on that
path.

### Migration numbering is not contiguous

Do not infer "migration N is missing" from a gap. The applied set skips
36 to 40, 43, 97, 100, 109, 110, and 122 to 127. Two files are also numbered
irregularly and sort wrongly under a naive numeric sort: `0075_categories_icon_url.sql`
and `0545_voucher_redemption.sql`. The highest applied number is 129.

---

## 2. Data model

Fifty-three tables in production, **all with row level security enabled**, none
disabled. They group like this.

**Identity and access**
`profiles` (one row per auth user, carries `role`), `supplier_members`,
`supplier_staff`, `suppliers`, `vendors`, `user_addresses`, `audit_log`.

**Catalogue**
`products`, `product_images`, `product_variants`, `categories`, `media_assets`,
`coupons`, `coupon_deals`, `coupon_codes` (the legacy voucher instance table).

**Cart and order**
`carts`, `orders`, `order_items`, `stock_reservations`.

**Money**
`payments`, `payment_tokens`, `payment_webhook_events`, `escrow_holds`,
`split_executions`, `settlement_events`, `invoices`,
`wallet_accounts`, `wallet_balances`, `wallet_entries`, `wallet_transactions`,
`legacy_percent_archive_112`.

**Vouchers**
`vouchers` (current), `voucher_redemptions`, `coupon_codes` (legacy).

**Growth**
`affiliates`, `referrals`, `referral_signals`, `referral_program_settings`,
`cashback_rules`, `discount_campaigns`, `discount_redemptions`,
`abandoned_cart_nudges`, `newsletter_subscribers`, `supplier_leads`.

**Messaging**
`notification_outbox`, `push_tokens`, `email_suppressions`.

**Search and SEO**
`search_events`, `search_index_dlq`, `popular_searches`, `user_recent_searches`,
`seo_redirects`.

**Infrastructure**
`rate_limits`, `user_rate_limits`.

### The two voucher tables

`coupon_codes` is the legacy instance table and `vouchers` is the current one.
Both are live. `escrow_holds` was originally keyed to `coupon_codes` with
`coupon_code_id NOT NULL`; migration 074 relaxed that and added `voucher_id`,
with a check constraint that exactly one of the two is set. That constraint is
`NOT VALID` in production because pre-existing rows violate it, so it guards new
rows only. Two legacy holds still carry `coupon_code_id`.

### Enums

Fourteen enums are defined. The ones that carry meaning:

- `order_status`: pending, paid, partially_fulfilled, fulfilled, cancelled, refunded
- `order_item_status`: pending, issued, shipped, delivered, cancelled, refunded
- `voucher_status`: issued, redeemed, expired, cancelled, refunded
- `escrow_status`: held, released, refunded
- `payment_status`: initiated, redirected, succeeded, failed, refunded
- `settlement_status`: pending, paid, split_executed, escrow_held, escrow_released, redeemed, refunded, cancelled, platform_settled
- `user_role`: customer, content_uploader, vendor, admin, super_admin, support
- `supplier_member_role`: owner, manager, scanner
- `product_status`: draft, active, paused, sold_out, archived
- `product_type`: coupon, physical, service

---

## 3. Money

### The unit rule

**Every internal money amount is an integer number of agorot.** One shekel is
100 agorot, which is also the minor unit Cardcom expects. Every rate is integer
basis points, where 10000 bp is 100%. No float is allowed anywhere on the money
path. All rounding uses integer arithmetic (the times-two half-up trick) so
results are deterministic across platforms.

The single implementation is `src/lib/money.ts`, which re-exports the branded
`Agorot` type and the primitive constructors from `src/lib/commerce/money`. VAT
is defined once, as `VAT_RATE_BP = 1800`. Eighteen percent is correct: the
Israeli rate rose from 17% on 2025-01-01. Any document still saying 17% or 1700
is stale.

### The unit rule is not finished in the database

This is the gap to know about. The schema still carries a mix of legacy `_ils`
columns and current `_agorot` columns:

- `orders`: `subtotal_ils`, `total_ils`, `discount_ils`, `cashback_applied_ils`
- `payments`: `amount_ils`, `wallet_applied_ils`
- `wallet_accounts`: `balance_ils`; `wallet_entries`: `amount_ils`
- `order_items`: both, `face_value_agorot` and `commission_agorot` alongside
  `cashback_earned_ils` and `coupon_price_ils`
- `vouchers` and `escrow_holds` and `split_executions`: agorot throughout

The five pending migrations that finish the conversion (138 through 142) are
unapplied. Until they are, "money is always integer agorot" is true of
`src/lib/money.ts` and of the newer tables, and not yet true of the older
columns.

### Commission

`platform_percent` is **dynamic per product** and is **snapshotted onto
`order_items` at order time**, so later changes to a product's rate never
restate an order that already happened. `order_items` carries both
`platform_percent` and `commission_percent_snapshot`. A
`product_platform_percent()` function exists in the database for the read side.

### The flow of one coupon sale

1. Customer checks out. `src/server/payments/checkout.ts` builds the order and
   snapshots price, `platform_percent` and cashback onto `order_items`.
2. Cardcom takes the payment. The integration uses the **legacy**
   `/Interface/*.aspx` endpoints, not the newer JSON API.
3. Cardcom calls back to `/api/payments/cardcom/webhook`. **The webhook is not
   signed.** The route therefore never trusts its payload as data: it re-reads
   authoritative state from Postgres and journals the raw body to
   `payment_webhook_events`, which is service-role-only.
4. `src/server/payments/finalize.ts` finalizes: the payment row goes to
   `succeeded`, vouchers are issued, and an `escrow_holds` row is written per
   unit. `held_agorot` is the whole prepayment, `commission_agorot` is the
   platform's take, `release_agorot` is what the supplier will get.
5. Nothing reaches the supplier yet. The money sits in escrow.
6. On redemption the hold is released in the **same transaction** as the voucher
   status flip, so "released hold with an unredeemed voucher" is not a reachable
   state.
7. `split_executions` records the executed split: `face_value_agorot`,
   `commission_agorot`, `supplier_agorot`.

### Expiry is not forfeiture

If a voucher expires unscanned, the supplier's hold is refunded and the customer
is credited in their wallet for what they paid. Neither the platform nor the
supplier keeps money for a service never rendered. The status sweep and the
money credit are deliberately two separate functions: if the money leg fails,
the statuses are still correct and the credit retries on the next cron run,
keyed so it can land only once.

### Wallet

`wallet_accounts` are double-entry style: `wallet_entries` carries a
`debit_account` and a `credit_account` and an `idempotency_key`. A negative
balance is correct for a house account, and only for a house account.

---

## 4. Coupon and voucher lifecycle

```
  purchase ──> issued ──┬──> redeemed        (supplier scanned the QR)
                        ├──> expired         (offer_valid_until passed, wallet refund)
                        ├──> cancelled       (order cancelled before use)
                        └──> refunded        (money returned)
```

A `vouchers` row carries the customer (`user_id`), the supplier
(`supplier_id`), the money (`face_value_agorot`, `coupon_price_agorot`,
`platform_percent`, `remaining_amount_due_agorot`), two independent clocks
(`expires_at` and `offer_valid_until`), and the QR material (`qr_key_id`,
`qr_payload`).

`remaining_amount_due_agorot` and `redeemed_amount_collected_agorot` exist
because a voucher is not always worth its face value at the counter: a coupon
bought for 50 against a 200 treatment leaves 150 to collect in the shop.

### Redemption

Redemption is a database RPC, `redeem_voucher()`, added in migration 074, and it
is `SECURITY DEFINER`. Doing it in one statement is the point: the voucher
status flip and the escrow release commit together or not at all.

The HTTP surfaces are `/api/supplier/redeem`, `/api/supplier/vouchers/lookup`,
`/api/supplier/vouchers/redeem`, and `/api/supplier/vouchers/redeem-batch`.
Every scan attempt is logged through `log_voucher_scan()` with a
`voucher_scan_outcome`, and the outcome enum is deliberately detailed, eleven
values covering `already_redeemed`, `wrong_supplier`, `invalid_signature`,
`rate_limited` and the rest, so a counter dispute can be answered from the log.

### A security note on the definer functions

`SECURITY DEFINER` functions here take the user id from the **caller**. That is
how an authenticated user can read another user's rows past RLS. This is proven,
not theoretical, and `check_rate_limit` is the anonymous equivalent. Pending
migrations 143, 144 and 145 revoke the unused definer grants. They are unapplied.

---

## 5. Roles and row level security

### Roles

`profiles.role` is a `user_role` enum: customer, content_uploader, vendor,
admin, super_admin, support. Supplier-side membership is separate, in
`supplier_members`, with its own `supplier_member_role` of owner, manager or
scanner. A person can be a customer in `profiles` and a scanner in
`supplier_members` at once, and the scanner role is what a shop's counter staff
gets.

Helper functions in the database: `is_admin()`, `is_support()`,
`is_supplier_owner()`, `is_supplier_member()`, `current_user_role()`,
`current_supplier_id()`. Migration 090 stops a user changing their own role.

### RLS

All 53 production tables have RLS enabled. **Eight have RLS on and zero
policies**, which is not a gap: Postgres denies every row to every non-superuser
role when no policy matches, so those tables are reachable only by the service
key and by `SECURITY DEFINER` functions. That is deny-by-default and it is
deliberate. Adding policies to satisfy the Supabase advisor's
`rls_enabled_no_policy` notice would **loosen** them. The eight:

`legacy_percent_archive_112`, `payment_webhook_events`, `rate_limits`,
`referral_signals`, `search_index_dlq`, `settlement_events`,
`stock_reservations`, `user_rate_limits`.

`supabase/rls-manifest.json` is the measured catalogue (2026-08-19, re-verified
2026-08-20 with zero drift). `src/lib/auth/rls-manifest.test.ts` is the CI gate
that reads it. Re-measure with `node scripts/check-rls.mjs`.

### Server action guards

Do not audit guards with a flat grep. A grep for a guard call inside action
files reports almost nothing and is wrong: the guards sit two hops in, behind
`withActionContext` wrappers.

---

## 6. Search

Three stages were designed. **Stage 1 is what runs.**

**Stage 1, Postgres.** `searchDb()` in `src/lib/search-server.ts`. Each word of
the query becomes its own `.or(name_he.ilike, description_he.ilike)` group, and
PostgREST ANDs the groups, so every word must match somewhere. Capped at 8
words. This replaced a single whole-phrase `ILIKE`, which failed for real
shoppers because all 61 active product names are more than one word. No
stemming, no ranking, no typo tolerance.

**Stage 3, Meilisearch.** Takes over automatically when `MEILISEARCH_HOST` and
`MEILISEARCH_API_KEY` are both set. There is **no Meilisearch client library**
in `package.json`; `searchMeili()` talks to the REST API with plain `fetch`, and
returns `null` on any failure so the Postgres path serves the request. The
returned `SearchOutcome` carries `engine: 'meilisearch' | 'database'` so the
active path is observable.

Indexing is an outbox: `/api/webhooks/products` enqueues, QStash
(`src/lib/search/qstash.ts`) transports, `/api/search/index-job` executes, and
`/api/search/index-dlq` drains failures out of `search_index_dlq`. The indexer
deliberately **re-reads the product from Postgres** rather than trusting the
webhook payload, and throws on any error so QStash retries with backoff. When
Meilisearch is unconfigured every job is a successful no-op, so the pipeline
stays wired and silent.

Supporting surfaces: `/api/search`, `/api/search/suggest`,
`/api/search/quick-links`, plus `fn_record_search` and
`fn_record_recent_search` feeding `search_events`, `popular_searches` and
`user_recent_searches`. Hebrew synonyms live in
`src/lib/search/hebrew-synonyms.ts`.

**What is not built.** `docs/ARCHITECTURE-SEARCH.md` specifies Postgres full
text search: a `search_vector` column maintained by trigger, GIN indexes,
`ts_headline` highlighting, `pg_trgm` `word_similarity` typo fallback, and
ranking weights A through C. None of it exists in the code. There is no
`search_vector` reference anywhere in `src/`. Read that document as a design
that was never implemented, not as a description of the system.

---

## 7. Deployment topology

**Runtime.** Next.js 16.2.12 on the App Router, React 19.2.4, TypeScript,
Tailwind. Package manager is **pnpm** (`pnpm@11.1.2`). `npm install` cannot work
in this repository and fails inside npm's tree builder before any lifecycle
hook, so there is no way to print a helpful error from inside the repo; see
`AGENTS.md`.

**Hosting.** Vercel, `framework: nextjs`, region `fra1` (Frankfurt), build
`pnpm build`, install `pnpm install --no-frozen-lockfile`.

**Data.** Supabase Postgres, project ref `ixvwfbuvfxxsjiywhbbb`. Storage buckets
for product and coupon images. R2 is documented for media but check before
assuming it is wired.

**Payments.** Cardcom, legacy `/Interface/*.aspx` endpoints, unsigned webhooks.

**Search.** Optional Meilisearch over REST, plus QStash for the index queue.

**Observability.** Sentry (`@sentry/nextjs` 10.68), Vercel Analytics and Speed
Insights.

### Scheduled jobs, and the trap in them

There are **ten** cron jobs, one route each under `/api/cron/`:
`abandoned-cart`, `expire-vouchers`, `health`, `invoices`, `notifications`,
`reap-carts`, `reconcile`, `stock`, `stranded-payments`, `subscriptions`.

`vercel.json` deliberately has **no `crons` key**. Vercel's Hobby plan registers
two jobs at daily granularity and silently ignores the rest, so four of the ten
(three on the money path, plus the only sender of voucher email) were believed
scheduled and were not. Any document that says Vercel Cron runs these is
describing a state that never worked.

They now run from **GitHub Actions**, `.github/workflows/cron.yml`, across seven
distinct schedule expressions mapped to the ten jobs by
`scripts/cron-jobs.json`. Two caveats, both deliberate and both load-bearing:

1. **It is off until two settings exist.** Variable `CRON_SCHEDULER_ENABLED=true`
   and secret `CRON_SECRET` matching Vercel's. The variable is checked before a
   runner starts, so while unset the schedules cost nothing and call nothing.
2. **GitHub cron is best effort.** Runs are delayed under load, routinely 5 to
   15 minutes, and a run can be dropped. `*/5` means "usually every five
   minutes". GitHub also disables scheduled workflows after 60 days with no
   commits, with an email and no other symptom.

`docs/CRON-EXTERNAL.md` names cron-job.org as the intended long-term scheduler.
If it is ever set up, turn the GitHub variable off, because running both calls
every job twice. All ten handlers are idempotent, so a double run is not a
correctness problem, but `notifications` sending twice is customer-visible if
outbox dedupe regresses.

Also note: a scheduled workflow only fires from the default branch. A cron
workflow on a feature branch never runs.

### Other workflows

`ci.yml`, `production-smoke.yml`, `commit-monitor.yml`,
`dependabot-auto-merge.yml`.

### Gates

`pnpm test` (Vitest), `pnpm type-check`, `pnpm lint` (Biome), and `pnpm build`.
**`pnpm build` is a separate gate**: `cacheComponents` rejects uncached page
reads that tests, type-check and lint all pass. E2E is Playwright and must run
against `pnpm start`, not a dev server. Note that local `next start` runs with
`NODE_ENV=production`, so production-only boot guards will brick the suite on a
laptop.

UI parity is measured against `refs/ke_live_singlefile.html` and the comparison
gate must stay under 11%:

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

---

## 8. Repository layout

```
src/app/         205 files   routes, App Router, route groups (store)/(admin)
src/lib/         349 files   money, search, supabase clients, auth, observability
src/components/  142 files   UI, all Hebrew RTL
src/server/       96 files   server actions and domain logic
                             payments/ referrals/ queries/ actions/ db/
                             domain/{vouchers,orders,reports} analytics/
src/content/      12 files
src/__tests__/    11 files
apps/mobile/                 the supplier till app, a SECOND caller of the
                             voucher RPCs; an audit that greps only src/ misses it
supabase/                    migrations/ functions/ seed/ schedules/
                             rls-manifest.json (measured production catalogue)
migrations/pending/          24 unapplied migrations awaiting approval
refs/                        ke_live_singlefile.html, the UI source of truth
scripts/                     ~100 operational scripts
```

`apps/mobile` matters more than its size suggests. It calls the voucher RPCs
directly, so a change to those signatures breaks the till app silently. Pending
migration 125 would do exactly that.

---

## 9. How to re-derive every number in this document

```bash
# production tables (53), and the eight service-role-only ones
python3 -c "import json;d=json.load(open('supabase/rls-manifest.json'));print(len(d['tables']))"

# what the migration files describe but production does not have (52)
# and the five production tables no migration creates
#   see the diff recipe in section 1

# applied migrations (115) and pending (24)
ls supabase/migrations/*.sql | wc -l
ls migrations/pending/*.sql | wc -l

# generated types cover only 33 of the 53 live tables
grep -cE '^      [a-z_]+: \{' src/types/database.ts

# cron routes (10)
find src/app/api/cron -name route.ts | wc -l

# VAT, in one place
grep -n 'VAT_RATE_BP' src/lib/money.ts

# RLS, re-measured
node scripts/check-rls.mjs
```

**When this document and an older document disagree, re-measure before believing
either.** Most of the older architecture documents in `docs/` were written as
binding specifications ahead of implementation, and a large number of them
describe tables, engines and schedulers that were designed and never built.
