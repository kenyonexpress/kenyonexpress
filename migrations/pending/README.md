# `migrations/pending/`

## 2026-09-04: two files pending — 162 (blocked on vault) and 169

> The "audit" paragraph below records the file moves; STATE.md's incident
> section (04.09 06:24) records the fuller truth: 166-168 were applied to
> production that morning by a parallel agent without prior approval, and
> Ofir owes a retroactive yes/no. The moves themselves correctly reflect the
> database.

An audit on 2026-09-04 ran every preflight against production and found that
166, 167 and 168 are **already applied and recorded** in
`supabase_migrations.schema_migrations` (versions `20260903232445`,
`20260903232455`, `20260903232504` — 2026-09-03 23:24 UTC), with the live
definitions matching the files byte-for-file (function body, trigger,
constraint expressions, policy set all compared). The three files and their
preflights moved to `migrations/applied/`; their rows joined the APPLIED IN
PRODUCTION table below. Every file in `migrations/applied/` now has a SHA-256
line in `migrations/applied/CHECKSUMS.sha256`
(verify with `cd migrations/applied && shasum -c CHECKSUMS.sha256`).

### `170_composite_indexes_top_queries.sql` — PENDING, not approved

Expand-only composite indexes for the ten hottest query patterns
(ARCHITECTURE-PERFORMANCE §6.3 + measured plans; baselines in
`docs/perf/indexes.md`). `CREATE INDEX IF NOT EXISTS` only, no drops, no
data changes; each pattern matched to the live code path that issues it and
checked non-duplicate against `pg_indexes`. Written by the parallel
autopilot session on 04.09. Preflight: `preflight_170.sql`.

### `169_analytics_server_event_names.sql` — PENDING, not approved

CREATE OR REPLACE of `fn_ingest_analytics_events`, byte-identical to 151's
except the name whitelist, which gains the four `SERVER_EVENT_NAMES` of
`src/lib/analytics/events.ts` (`begin_checkout`, `purchase`,
`voucher_redeemed`, `order_refunded`). 151 shipped with only the eight
client names, and the function skips unknown names by design — so every
server event ever emitted (begin_checkout since the checkout wave, the three
step-14 additions) has been silently dropped. Until this applies they keep
being dropped, harmlessly and documented at the emit sites. Preflight:
`preflight_169.sql` — signature, before-picture of the whitelist,
service_role-only grants.

### `162_cron_schedule.sql` — PENDING, approved (CLOSEOUT §7), blocked on vault

Schedules the twelve jobs of `scripts/cron-jobs.json` through pg_cron + pg_net
(161 installed both). Job commands read `cron_secret` and `app_url` from vault
at run time, so `cron.job.command` stores neither value. BLOCKED: the vault
holds neither secret and seeding them needs the Vercel production env, which
this machine cannot reach (no `vercel` CLI, no link). The exact seeding
commands are under "## חסמים לאופיר" in STATE.md. Preflight:
`preflight_162.sql` — every block must pass through MCP `execute_sql` first.

### `165_revoke_anon_helpers.sql` — CANCELLED 2026-09-04, moved to `migrations/cancelled/`

Would have revoked EXECUTE on `public.is_admin()` and
`public.is_supplier_member(uuid)` from `anon` (CLOSEOUT §8c). Cancelled by
CLOSEOUT §13: the stop-and-think its own preflight flagged came back positive.
Eighteen RLS policies on public/anon-readable tables (product_images,
coupon_deals, suppliers, seo_redirects, cashback_rules, categories, wallet_*,
split_executions, escrow_holds, payments, carts, notification_outbox) call the
helpers inside USING/WITH CHECK; quals run as the caller, so the revoke turns
every anonymous catalogue SELECT into 42501. anon EXECUTE here is **by
design** — the helpers return false for a caller with no uid. Regression net:
`src/db/__tests__/anon-catalog.test.ts`. The file and `preflight_165.sql` live
in `migrations/cancelled/` with the reason at the top.

### `166_voucher_transition_guard.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

BEFORE UPDATE trigger on `public.vouchers.status`, in 137's idiom. Closes the
gap VOUCHER-LIFECYCLE.md §1 records: 137 guards orders/order_items/payments
and never covered `vouchers`, so a service_role statement can un-redeem a
burned voucher and let it be collected twice. Allows exactly the four
`issued -> redeemed | expired | cancelled | refunded` moves; every non-issued
state is terminal by design (value restored later is a wallet credit, not a
state change). No-op updates, INSERTs and NULLs pass untouched. Preflight:
`preflight_166.sql` — enum labels, column type, no existing trigger, row
counts per status.

### `167_order_items_money_constraints.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

Sign constraints (`col IS NULL OR col >= 0`) on the eight agorot columns of
`order_items` that carry none — balance_due, cashback_amount, commission,
escrow_held, escrow_release, face_value, paid_on_site, supplier_immediate —
plus the conservation CHECK `face = paid_on_site + balance_due` (NULL on any
side passes; pre-070 rows keep moving). Both are BUSINESS-RULES §10 entries:
stated rules nothing refuses to break. The JS half shipped first
(`assertOrderItemMoneyInvariants` in `src/lib/commerce/order-money-columns.ts`
throws on every insert path), so the running writer cannot produce a violating
row and the apply is safe for it. Refuses rather than corrupts, like 126: ADD
CONSTRAINT validates all rows and raises on a violator. Preflight:
`preflight_167.sql` — columns exist, names free, zero negative rows, zero
non-conserving rows, table scale.

### `168_wallet_ledger_client_readonly.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

Drops the six authenticated INSERT/UPDATE/DELETE policies on
`wallet_balances` and `wallet_transactions` (marathon step 6). Measured live
on 04.09: the write policies are gated on `is_admin()`, which is the wrong
door — an admin's browser session can write ledger rows directly, a money
movement with no audit_log row. Every code path that touches the tables
(admin user page, apps/mobile wallet screen) is SELECT-only, so nothing
running loses anything; service_role bypasses RLS and the audited server
writers are untouched. The two SELECT policies (admin/support/owner) stay.
Live regression net: `src/db/__tests__/wallet-rls.test.ts` (anon half; the
full per-role matrix is marathon step 10). Preflight: `preflight_168.sql`.

## 2026-09-03: every row below is APPLIED (history)

### `159_pin_search_path_and_revoke_enqueue.sql` — APPLIED 2026-09-03

Applied to production through MCP alongside 158 and verified. Pins
`search_path = pg_catalog, public` on `set_updated_at`, `add_business_days`,
`payout_available_at` and `enforce_payout_availability`, and revokes EXECUTE on
`enqueue_search_index()` from `public`/`anon`/`authenticated`.

The number 159 briefly belonged to the pending orders-indexes file; that one was
renamed the same day (its second rename -- it arrived as `005`), and ended at
`163_orders_indexes.sql`: `160_fk_indexes.sql` and `161_enable_pg_cron_pg_net.sql`
were both applied to production on 2026-09-03, and `162` is reserved for the cron
schedule those two make possible. **New migrations start at 164.**

### `160_fk_indexes.sql` — APPLIED 2026-09-03

Applied to production through MCP and verified. Ten `create index if not
exists` statements covering foreign keys that had no index behind them:
`payment_events.actor_id`, `payout_statements.approved_by`, three on `refunds`
(`decided_by`, `payment_id`, `requested_by`), two on `reviews` (`reviewed_by`,
`user_id`), two on `subscriptions` (`origin_order_id`, `payment_token_id`) and
`wishlists.product_id`.

Every statement is `if not exists`, so re-running it is a no-op. There is no
rollback row because dropping an index that supports a foreign key is not a
restoration of anything: `drop index if exists public.<name>;` per line, if one
is ever actually wanted.

**This is the file that pushed the orders-indexes migration off 160.**

### `161_enable_pg_cron_pg_net.sql` — APPLIED 2026-09-03

Applied to production through MCP and verified. Enables `pg_cron` (schema
`pg_catalog`, version 1.6.4) and `pg_net` (schema `extensions`, version 0.20.0),
then grants `usage on schema cron` to `postgres`.

The schemas are read off production, not chosen: `pg_cron` lives in whatever
schema it was installed into and cannot be moved, so naming a different one
would make the file describe a database that does not exist.

**Why both, and why the grant.** `pg_cron` schedules but cannot make an outbound
request; `pg_net` supplies `net.http_post`, which is what lets a job reach a
Vercel route. The grant is what lets `postgres` call `cron.schedule` at all --
without it, `162` fails on its first statement.

This migration is what closes the standing GO/NO-GO blocker recorded in
`STATE.md`: the cron routes existed and nothing in the world called them.
Verified at the time of writing: `select count(*) from cron.job` returned **0**,
so no job is scheduled yet -- that is `162`, which is pending.

### `163_orders_indexes.sql` — APPLIED 2026-09-03

Written by a parallel agent session (commit `fbdd8e1f5`) alongside Drizzle
schemas at `src/db/schema/orders.ts` and `order-items.ts`. Creates `orders` and
`order_items` guarded by `IF NOT EXISTS`, plus three indexes on
`orders(user_id)`, `orders(created_at)` and `order_items(created_at)`.
**Applied to production through MCP on 2026-09-03 and verified.** Both tables
were already live, so the CREATEs no-opped and the net effect was the three
indexes, exactly as the file header predicted.

**It arrived numbered `005` and was renamed twice.** `supabase/migrations/`
already holds `005_products_schema.sql`, so the original name meant two different
things in the two directories, and `005` sorted ahead of the entire 122-158 applied
series -- every member of which already assumes these two tables exist. The
numbering assertion in `pending-migrations-inventory.test.ts` is what caught it.
The later renames, `160` -> `163`, are the same rule once more: `160_fk_indexes.sql`
and `161_enable_pg_cron_pg_net.sql` went to production on 2026-09-03 and `162` is
reserved for the cron schedule, and a number that names both an applied file and an
unapplied one is the exact confusion this directory keeps paying for.

The file itself is honest about the rest: its header records that both tables
are already live on the hosted DB, so every `CREATE` is guarded and the net
effect on production is the three indexes. `APPLY-ORDER.md` does not list it.

---

## Every row below is APPLIED.

### `158_revoke_anon_public_on_new_functions.sql` — APPLIED 2026-09-03

Applied to production through MCP by the cloud session and verified
(`anon_exec` 3, `migrations` 111). The file now lives in `migrations/applied/`.

Revokes `EXECUTE` from `public`, `anon` and `authenticated` on ten functions
added by 130/131/137/149/152/157 and by `118_search_intelligence`, in an
idempotent `DO` loop. All ten were confirmed to exist before the file was
written. **Not applied.**

**TWO THINGS THAT ARE NOW LIVE IN PRODUCTION.** Both were raised before the
file was applied and neither was changed, so both are in effect now. Neither is
a crash; both are silent. They are recorded here so the next person to see the
symptom does not have to rediscover the cause.

1. **`fn_record_recent_search(text)` has a live `authenticated` caller.**
   `118_search_intelligence.sql` grants it to `authenticated, service_role` on
   purpose, and `src/lib/search/record.ts:52` calls it **with the visitor's own
   client** (`recordRecentSearch(client, term)`), from
   `src/app/(store)/search/page.tsx`. Revoking `authenticated` stops that RPC.
   It fails soft -- the caller logs `search.recent_record_failed` and returns --
   so nothing crashes and nothing tells you: recent-search recording just stops
   for signed-in users. This is the same situation that got `supplier_app_context`
   withdrawn from 143. **To restore it:**
   `GRANT EXECUTE ON FUNCTION public.fn_record_recent_search(text) TO authenticated;`

2. **`add_business_days` and `payout_available_at` rely on the default `PUBLIC`
   grant.** `152_payout_machinery.sql` contains no `GRANT` for either, and both
   are plain `STABLE` functions, not `SECURITY DEFINER`. Revoking from `PUBLIC`
   therefore removes the only grant they have. Anything that calls them and is
   not the owner -- including `service_role`, which the cron and repair paths
   run as -- gets `permission denied`. **To restore it:**
   `GRANT EXECUTE ON FUNCTION public.add_business_days(timestamptz, integer) TO service_role;`
   and the same for `public.payout_available_at(timestamptz)`.

**The automated gate does not cover this file.**
`src/__tests__/revoked-functions-have-no-callers.test.ts` finds revokes with
`/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(\w+)/`. This migration builds
its statement with `format('... %s ...', f)`, so the literal never appears and
the scanner matches nothing. Both findings above were established by hand.

---

## The rows below are APPLIED

All thirty-four files listed in this README were applied to production through
MCP `apply_migration` on 2026-09-03 and moved to **`migrations/applied/`**. The
rows stay here because this README is still the only written description of what
each migration does, and the number sequence has to stay readable. To find a
file named below, look in `migrations/applied/`.

**Nothing is awaiting approval right now.** A newly written migration goes back
into this directory and is listed as pending again.

`pnpm test` enforces both halves: `pending-migrations-inventory.test.ts` asserts
this directory holds no `.sql`, and that every row below resolves to a file in
`applied/`.

---

Unapplied migrations live here. **Nothing placed in this directory has been run
against any database.** Nothing here may be applied with `db push` — the project
forbids it. The route to production is `apply_migration` through MCP, after Ofir
approves the file.

## This is now the only pending location

`supabase/migrations/` holds applied production migrations only. The three
`PENDING-` files that used to sit there were moved here on 2026-09-01 and
renumbered into the sequence below:

| was | is now |
| --- | --- |
| `supabase/migrations/PENDING-109-recurring-subscriptions.sql` | `135b_recurring_subscriptions.sql` |
| `supabase/migrations/PENDING-110-supplier-coordinates.sql` | `136_supplier_coordinates.sql` |
| `supabase/migrations/PENDING-money-integer-fix.sql` | superseded; the in-place path was deleted 2026-09-01, see DECISIONS |

Every reference to the old paths across `src/`, `apps/`, `docs/`, `scripts/`
and the root `*.md` files was rewritten in the same commit. There is no second
location left to read.

## Numbering

`120` and `121` were each used twice, in two directories, with two different
meanings. That is fixed: every file here was renumbered from **122 upward**,
skipping `128` and `129`, which are taken by
`supabase/migrations/128_wp_publish.sql` and `129_catalogue_cleanup.sql`.
Highest number applied in production is `129`. No number now repeats across the
two directories.

## RESOLVED 2026-09-01: the additive path (138-141) won. 142 is deleted.

Both convert money to integer agorot and they collide.

- **138-141 (recommended)** are *additive*: they add a `<col>_agorot bigint`
  beside each numeric column, `GENERATED ALWAYS AS (round(<col> * 100)::bigint)
  STORED`, so it can never drift from the column it mirrors. Applying them is a
  no-op for the running application, and they are reversible with a
  `DROP COLUMN`.
- **142** converts *in place*, renaming `total_ils` → `total_agorot` and
  changing its type. The moment it lands, every reader that still says
  `total_ils` breaks, and every reader that does not gets a number 100× larger.

They produce **9 identical column names** on the same tables, so applying 142
after 138-141 fails outright with "column already exists":

```
coupon_deals.original_price_agorot     products.compare_at_price_agorot
coupon_deals.platform_price_agorot     products.full_price_agorot
coupons.original_price_agorot          products.kenyon_price_agorot
product_variants.price_agorot          profiles.wallet_balance_agorot
product_variants.price_modifier_agorot
```

and a further 23 columns where the names differ only by an `_ils` infix
(`orders.total_ils_agorot` from 138 vs `orders.total_agorot` from 142), which
would leave the table carrying two agorot columns for one amount.

**Decision, taken 2026-09-01 and logged in `docs/DECISIONS.md`:** the additive
path is the production-safest option, so 138-141 are in the apply order and
**142 is parked**. It is kept, not deleted, because it is the only written
description of the eventual in-place end state, and because the decision to
abandon it belongs to Ofir.

### 142 was verified against production, and it is not a no-op

An earlier version of this file claimed production already stored money as
integer agorot, and that 142 therefore did nothing. **That claim was false.**
Measured against `ixvwfbuvfxxsjiywhbbb` on 2026-09-01, all **41** columns 142
targets are still `numeric` on real tables (`relkind = 'r'`); none is already
an integer, so none was removed from the file:

```
orders.total_ils        orders.subtotal_ils      orders.discount_ils
payments.amount_ils     payments.wallet_applied_ils
order_items.unit_price_ils  order_items.total_price_ils
products.price_ils      wallet_accounts.balance_ils    ... 41 total
```

The columns that *are* already integer agorot — `order_items.face_value_agorot`,
`vouchers.coupon_price_agorot`, `settlement_events.commission_agorot` and the
rest — are **different columns**, added alongside the numeric ones. That dual
representation is what made the earlier claim look true from a distance.

## The manifest

Blast radius is what breaks if the file is applied while the current code is
running. Order is the position in the apply sequence.

| # | File | What it changes | Blast radius | Order | Prerequisite | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 122 | `122_deny_all_on_server_only_tables.sql` | Restrictive `using (false)` policy on the 5 server-only tables | **None.** RLS-on-no-policy is already deny; changes no effective permission | 1 | none | `drop policy if exists deny_all_client_roles on public.<each of the 5>;` |
| 123 | `123_products_whatsapp_enabled.sql` | `products.whatsapp_enabled boolean not null default false` + partial index | **None.** Defaults false, so no product changes behaviour | 2 | none | `drop index if exists public.products_whatsapp_enabled_idx; alter table public.products drop column if exists whatsapp_enabled;` |
| 124 | `124_categories_sort_order.sql` | One `UPDATE`: `electronics` `sort_order` 10 → 12 | **Cosmetic.** Fixes a tie that made category order planner-dependent | 3 | none | `update public.categories set sort_order = 10 where slug = 'electronics';` |
| 125 | `125_expire_vouchers_drop_escrow.sql` | Replaces `expire_vouchers()`, dropping its last escrow branch | **Low.** Escrow model already abolished in 085; this finishes it | 4 | migration 085 (applied) | Restore the prior body from `supabase/migrations/085_voucher_scan_audit_and_no_escrow.sql` |
| 126 | `126_percent_range_checks.sql` | `CHECK (0..100)` on 12 unconstrained percent columns | **Low.** Fails at apply time only if a row is already out of range | 5 | none | `alter table public.<t> drop constraint if exists <t>_<col>_range;` (12 statements, listed in the file) |
| 127 | `127_homepage_cms.sql` | `banners`, `homepage_sections`, RLS policies, scheduling windows | **None.** Readers treat absence as normal and fall back to `src/lib/hero-singlefile-data.ts` | 6 | none | `drop table if exists public.banners, public.homepage_sections cascade;` |
| 130 | `130_payment_events.sql` | `payment_events` append-only table, `payment_event_type` enum, no-mutation trigger | **None.** New table, no existing reader | 7 | none | `drop trigger if exists payment_events_no_mutation on public.payment_events; drop function if exists public.payment_events_append_only(); drop table if exists public.payment_events; drop type if exists public.payment_event_type;` |
| 131 | `131_refunds.sql` | `refunds` table, `refund_state` + `refund_ground` enums | **None.** Holds no money truth; `payments` stays authoritative | 8 | 130 (shares the payment vocabulary) | `drop table if exists public.refunds; drop type if exists public.refund_state; drop type if exists public.refund_ground;` |
| 132 | `132_search_index_outbox.sql` | `search_index_outbox`, enqueue trigger on `products`, `claim_search_index_jobs()` | **Low.** Adds a trigger to `products`; every product write now also writes an outbox row | 9 | none | `drop trigger if exists products_enqueue_search_index on public.products; drop function if exists public.enqueue_search_index(); drop function if exists public.claim_search_index_jobs(integer); drop table if exists public.search_index_outbox;` |
| 133 | `133_supplier_branches.sql` | `supplier_branches` table | **None.** Changes no money and no authorisation; a voucher still redeems against `suppliers.id` | 10 | none | `drop table if exists public.supplier_branches;` |
| 134 | `134_order_items_delivered_at.sql` | `order_items.delivered_at`, physical-only constraint, `order_item_cancellation_deadline()` | **Low.** Nullable column; the deadline function is new | 11 | none | `drop function if exists public.order_item_cancellation_deadline(uuid); drop index if exists public.order_items_delivered_at_idx; alter table public.order_items drop constraint if exists order_items_delivery_is_physical_only, drop column if exists delivered_at;` |
| 135 | `135b_recurring_subscriptions.sql` | `recurring` enum member, `subscriptions`, `subscription_charges`, 3 billing columns on `products` | **Medium.** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block and cannot be rolled back | 12 | none | Tables and columns drop cleanly; **the `recurring` enum member is permanent** — Postgres cannot remove an enum value |
| 136 | `136_supplier_coordinates.sql` | `suppliers.latitude`/`.longitude`, GiST index, pair CHECK | **None.** `supplierLocation()`'s exact branch is dead code until the columns exist | 13 | `cube` + `earthdistance` extensions | `drop index if exists public.suppliers_earth_idx; alter table public.suppliers drop constraint if exists suppliers_latlng_pair, drop column if exists latitude, drop column if exists longitude;` |
| 137 | `137_order_transition_guard.sql` | Status-transition guard triggers on `orders`/`vouchers`/`payments`, immutable `audit_log` | **Medium.** Constrains the service role, which every cron, webhook and repair script runs as. An illegal transition that used to succeed now raises | 14 | 130, 131, 134 (guards reference their statuses) | `drop trigger if exists audit_log_no_delete on public.audit_log; drop trigger if exists audit_log_no_update on public.audit_log; drop trigger if exists vouchers_status_guard on public.vouchers; drop trigger if exists payments_status_guard on public.payments; drop trigger if exists orders_status_guard on public.orders;` (+ the 6 guard functions) |
| 138 | `138_money_agorot_money_path.sql` | Adds a **generated** `_agorot` beside numeric on `orders`, `order_items`, `payments` | **None at apply.** Additive and unwritable. The `>= 0` checks become live on the numeric column's sign | 15 | none | `alter table public.orders drop column if exists subtotal_ils_agorot, drop column if exists total_ils_agorot, drop column if exists discount_ils_agorot;` (+ `order_items`, `payments`) |
| 139 | `139_money_agorot_wallet.sql` | Adds a **generated** `_agorot` on `wallet_accounts`, `wallet_balances`, `wallet_entries`, `wallet_transactions` | **None.** Additive. No `>= 0` check on balances: `wallet_accounts.balance_ils` has a live minimum of −1.80 | 16 | 138 | `alter table public.wallet_accounts drop column if exists balance_ils_agorot;` (+ the other 3 tables) |
| 140 | `140_money_agorot_catalog.sql` | Adds a **generated** `_agorot` on `products`, `product_variants`, `coupon_codes`, `coupon_deals`, `coupons` | **None at apply.** Additive. `price_modifier` stays signed — a variant may be cheaper than its base | 17 | 138 | `alter table public.products drop column if exists price_ils_agorot, drop column if exists coupon_price_ils_agorot, drop column if exists cost_ils_agorot, drop column if exists full_price_agorot;` (+ the other 4 tables) |
| 141 | `141_money_agorot_growth.sql` | Adds a **generated** `_agorot` on `affiliates`, `referrals` | **None at apply.** Additive. Both are cumulative earnings, so both take the non-negative check | 18 | 138 | `alter table public.affiliates drop column if exists total_earnings_ils_agorot; alter table public.referrals drop column if exists bonus_paid_amount_ils_agorot;` |
| 143 | `131_refunds.sql` | `20260901013505` | `131_refunds` | `refunds` table + trigger `refunds_due_by_is_derived` |
| `132_search_index_outbox.sql` | `20260901013525` | `132_search_index_outbox` | `search_index_outbox` + trigger `products_enqueue_search_index` |
| `133_supplier_branches.sql` | `20260901013612` | `133_supplier_branches` | `supplier_branches` + 3 policies |
| `143_revoke_unused_definer_execute.sql` | Revokes `EXECUTE` on 5 SECURITY DEFINER functions from `anon`/`authenticated` | **Medium.** Closes a live RLS bypass in `voucher_success_payload`. `supplier_app_context` was withdrawn from this file — the Expo till calls it | 19 | `src/__tests__/revoked-functions-have-no-callers.test.ts` green | `GRANT EXECUTE ON FUNCTION public.<fn> TO anon, authenticated;` (5 statements, listed in the file) |
| 144 | `144_revoke_authenticated_dml.sql` | Revokes INSERT/UPDATE/DELETE from `authenticated` on the 8 RLS-on-zero-policy tables | **Low.** Defence in depth; RLS already blocks these, but RLS does not cover `TRUNCATE` | 20 | 122 (same 5 tables, policies first) | `GRANT INSERT, UPDATE, DELETE ON public.<t> TO authenticated;` (8 statements, listed in the file) |
| 145 | `145_revoke_check_rate_limit_execute.sql` | Revokes `EXECUTE` on `check_rate_limit` from `anon`/`authenticated` | **HIGH IF MISORDERED.** See below | **21 — LAST** | ⛔ **CODE-FIRST: commit `d5c2739d4`** | `GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;` |

## 138-141 add GENERATED columns, and that is what makes step 2 possible

The first draft added a plain `bigint` and filled it once:

```sql
alter table public.orders add column if not exists total_ils_agorot bigint;
update public.orders set total_ils_agorot = round(total_ils * 100) where ...;
```

Nothing kept it in step after that. No trigger, no default, no NOT NULL. The
running application writes `total_ils` and does not know the new column exists,
so **every order placed after the apply would have carried `total_ils_agorot`
NULL** — and step 2 of the cutover, rewriting the readers onto those columns,
is the entire reason the files exist. A customer who had just paid would have
been shown a total of 0.00, and the split would have settled a commission of
zero against it. The one-shot backfill made the migration look finished while
guaranteeing the step that follows it would be wrong.

All 32 columns are now:

```sql
alter table public.orders
  add column total_ils_agorot bigint
    generated always as (round(total_ils * 100)::bigint) stored;
```

which cannot drift: Postgres recomputes it on every insert and update of the
base column, and refuses any write that names it.

**Measured against `ixvwfbuvfxxsjiywhbbb`, PostgreSQL 17.6, not assumed.** The
generated form tracks insert, update and NULL, `-1.80` yields `-180`, and a
write to the generated column is refused with SQLSTATE `428C9`. The real DDL
for `orders.total_ils` and `product_variants.price_modifier` was then run
against the live tables inside a `DO` block that raises at the end, so it rolled
itself back:

```
DRYRUN_OK cols=1 backfill=[18.00->1800, 18.00->1800, 18.00->1800, 817.00->81700]
leftover_columns = 0
```

**Two consequences worth stating rather than discovering later.**

1. The non-negative CHECKs are no longer decorative. On a backfilled column
   nothing re-evaluated them; on a generated column they are validated on every
   write, so they now constrain the numeric column's sign at runtime. Every
   checked column was measured first and none is negative today, so the apply
   validates. The signed wallet columns still get no check.
2. **Step 3 is no longer a plain `DROP COLUMN`.** A generated column depends on
   its base column, so dropping the numeric one requires
   `ALTER TABLE ... ALTER COLUMN <col>_agorot DROP EXPRESSION` first, which
   turns it into an ordinary written column and keeps the stored values. This
   also hardens the exclusion with 142: 142's `ALTER TYPE` on a base column is
   refused outright while a generated column depends on it.

## ⛔ 145 is CODE-FIRST and it is one-way

**Required commit: `d5c2739d4`** — *"docs: מדריך הזנת דיל חדש (CONTENT-OPERATIONS-GUIDE) (#6)"*.
The title says docs; the commit also carries the change that matters here, in
`src/lib/utils/rate-limit.ts`:

```diff
-import { createClient } from '@/lib/supabase/server'
+import { createAdminClient } from '@/lib/supabase/admin'
-  const supabase = await createClient()
+  const supabase = adminClientOrNull()
```

Also required: **`8e26c3754`** (*"feat(rate-limit): a sliding window on Upstash
behind all thirty callsites, with Postgres as the fallback"*), which relocated
the Postgres fallback call into `src/lib/rate-limit/limiter.ts`. It is still the
same `createAdminClient()` call, so `service_role` still reaches the RPC — but
the callsite moved, and a check of the old path alone would now measure nothing.

Both are ancestors of `origin/main` as of 2026-09-01, so the prerequisite is
**merged**. What remains is that main is *deployed*: verify the running
production build contains `d5c2739d4` before applying 145.

**Why the order is one-way.** Apply 145 while a build older than `d5c2739d4` is
live and the RPC starts returning `42501` to a caller that is still `anon`. The
limiter's fail-open branch catches it, logs, and returns "allowed". Every rate
limit in the application — OTP, cart writes, checkout, search — turns off, and
the only symptom is a log line nobody is watching. That is strictly worse than
the hole 145 closes.

## Reference only — not in the apply order

### `the in-place money migration (deleted 2026-09-01)`

**NOT FOR EXECUTION. Superseded by the additive approach in 138-141. Retained as
the written specification of the eventual in-place end state. Do not apply.**

The same note now stands in the file's own header, so a reader who opens the SQL
without this README sees it too.

| # | File | What it changes | Blast radius | Order | Prerequisite | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 142 | `the in-place money migration (deleted 2026-09-01)` | Converts 41 money columns in place, numeric ILS → bigint agorot; rebuilds `fn_wallet_transfer`, `fn_pay_referral`, 2 wallet views | **CATASTROPHIC. PARKED — DO NOT APPLY.** Mutually exclusive with 138-141; ~55 code files still read the old ILS names | — | Abandoning 138-141 **and** rewriting every reader first | Inverse rename + `ALTER TYPE ... USING <col> / 100.0`, plus restoring both functions and both views. **Treat as one-way in practice.** |

It is kept, not deleted, for the reason recorded in `docs/DECISIONS.md`: it is
the only written description of the eventual in-place end state, and the
decision to abandon it belongs to Ofir. `src/__tests__/pending-migrations-inventory.test.ts`
counts it among the files on disk, so deleting it fails that test.


## Apply order

```
122 → 123 → 124 → 125 → 126 → 127 → 130 → 131 → 132 → 133 → 134
    → 135 → 136 → 137 → 138 → 139 → 140 → 141 → 143 → 144 → 145
```

`142` is not in the sequence. It is parked and mutually exclusive with 138-141.

## Inventory is enforced by a test

`src/__tests__/pending-migrations-inventory.test.ts` checks both directions:
every `.sql` on disk appears in this manifest, and every `.sql` this manifest
names exists on disk. It also asserts `supabase/migrations/` contains no
`PENDING-` file, so the split location cannot come back.

`src/__tests__/revoked-functions-have-no-callers.test.ts` re-derives the revoke
list from this directory and checks it against every `.ts`/`.tsx` in **both**
`src/` and `apps/`, so revoking a function the Expo till uses fails a test
rather than a till.

## `157_audit_ip_retention.sql`, added 2026-09-02

IP aging on the append-only audit trail, AFTER 149. The exception is carved
into 149's trigger as narrowly as it can be written: UPDATE passes only when
the sole change is ip_address -> NULL on a row older than 365 days; DELETE
stays refused. fn_audit_retention_sweep() (definer, EXECUTE service-role
only) is the single caller, driven monthly by /api/cron/retention, which
answers ok+pending until this applies.

**Dry run against production, rolled back** (149 recreated first inside the
txn): ordinary UPDATE and DELETE refused 42501; sweep aged the seeded old
row, left the young row intact; second sweep aged 0.

## `156_analytics_indexes.sql`, added 2026-09-02

Two partial indexes for the admin analytics windows: orders(paid_at DESC)
where paid and not deleted (production has only the OPPOSITE half,
idx_orders_pending_expiry), and vouchers(redeemed_at DESC) where redeemed
(the existing redeemed index leads on supplier_id, useless for admin-wide
window scans).

**Dry run against production, rolled back:** both created, pg_indexes
count=2 inside the transaction.

## `155_shipment_tracking.sql`, added 2026-09-02

Physical fulfillment's two missing columns -- order_items.carrier +
tracking_number (the state machine itself already lives in item_status /
shipped_at / delivered_at, per line) -- and 'order_shipped' added to the
outbox kind check. **Must run after 150** (the file refuses otherwise: both
rebuild the same constraint, and running first would drop account_deleted).
Transitions stay in code (audited server action, portal §5.2); production
has no item_status trigger by design.

**Dry run against production, rolled back:** columns added, a real physical
line moved pending→shipped with carrier+tracking, order_shipped accepted,
a bogus kind still 23514.

## `154_reviews_wishlist.sql`, added 2026-09-02

Verified-purchase reviews and the wishlist the masthead heart points at. The
purchase verification IS the INSERT policy: a review row exists only when its
order_item belongs to a paid-or-later order of the inserting user and sells
the named product; UNIQUE(order_item_id) is the once-per-purchase barrier.
Moderation is a status column driven by the service role (no user UPDATE
policy at all). Wishlists are owner-only both ways. Until applied, every
reader degrades to "no reviews / empty wishlist" (PGRST205) and the submit
actions answer in Hebrew that the feature is not open yet.

**Dry run against production, rolled back:** verified insert as a real buyer
passed; duplicate slot, unverified item, and a foreign user claiming the same
purchase all refused; the pending row invisible to anon. ok=t problems=[none].

## `153_ai_usage.sql`, added 2026-09-02

The AI cost ledger: one row per agent call through `src/server/ai/client.ts`
with tokens, micro-USD cost (integers, same reason money is agorot), outcome
and latency. The runtime works before this applies and logs
`ai.usage_not_recorded` at warn. RLS on, zero policies.

**Dry run against production, rolled back:** insert accepted, negative token
count refused 23514.

## `152_payout_machinery.sql`, added 2026-09-02

The FIFTH instance of the pattern: `admin/payouts.ts` calls four payout
functions and the supplier page reads `payout_statements`, and production has
none of it -- not the tables, not the functions, not the supplier payout-terms
columns. Only the enum exists. Every payout action has failed at runtime since
the module shipped.

A faithful port of the payout sections of 027 + 051 + 079, stitched in
dependency order, ADAPTED where 079 was written for the post-059 schema the
hosted database never got: the generate reads `total_price_ils`,
`platform_percent`, `commission_agorot` and `supplier_immediate_agorot` -- the
numbers settlement actually books -- instead of `platform_bp` and
`supplier_payout_agorot`, which exist nowhere in production. The legacy
coupon_codes section is deliberately not ported (different shape, zero rows to
pay). mark_paid's dispute/bank reads became dynamic-if-table-exists, because
supplier_disputes and supplier_bank_accounts do not exist and 027's refusal
would have made mark_paid permanently uncallable -- the disease this file
cures.

**Dry run against production, rolled back:** generate created a statement,
totalled zero, rolled it over per C8 (cancelled + rolled_over + lines
deleted); approve/paid/cancel each refused the rolled-over statement with their
own exact errors. The dry run itself caught a composition bug (a 3-arg grant
before the 4-arg definition).

## `151_analytics_ingest.sql`, added 2026-09-02

`/api/a` validates consented client events and calls
`fn_ingest_analytics_events`. That function did not exist and neither did any
events table: every batch ever sent returned "function not found" and vanished
-- a caller without its function, the fourth instance of the closeout's
recurring pattern.

The table plus the definer function, written to the CALLER's payload exactly,
so applying this turns the existing pipeline on without touching app code.
Unknown event names are skipped rather than failing the batch; event_id dedups
replays; the IP is accepted and not stored; RLS on with zero policies so only
the definer path writes. Adds `whatsapp_click` to the accepted names -- the
client emits it from the PDP share button as of the same commit, and like every
other event it goes nowhere until this applies.

**Dry run against production, rolled back:** 3-event batch -> 2 stored + 1
unknown skipped; replayed event_id -> 0 new rows; non-array -> 22023.

## `150_account_deletion.sql`, added 2026-09-02

The deletion the privacy policy promises, with no code behind the promise until
now. `fn_anonymize_user` (SECURITY DEFINER, EXECUTE for service_role only)
anonymizes the profile in place -- orders keep their FK and their statutory
7-year retention -- deletes the personal satellites (addresses, saved cards,
push tokens, carts, recent searches), and writes the erasure to audit_log.
Owner columns verified against production: three tables key on `user_id`, two
on `profile_id`. Plus the `account_deleted` outbox kind for the goodbye email.

**Dry run against production, rolled back, on a real profile:** email hashed to
`deleted+…@anonymized.invalid`, name replaced, satellites 0, orders preserved,
idempotent rerun OK, null uid refused 22004.

The server action works before this is applied: it tries the RPC, and on
PGRST202 falls back to the same steps through the service client, deriving the
same email hash byte-for-byte (verified: node and Postgres agree on
`deleted+9f89c84a559f5736@…` for the zero uuid).

## `149_audit_log_append_only.sql`, added 2026-09-02

Production has NO triggers on `audit_log`, and RLS does not bind service_role,
so the application's own key can UPDATE or DELETE any audit row. An audit trail
the audited code can edit is a log, not an audit trail.

One trigger, BEFORE UPDATE OR DELETE, raising 42501 for every role including
service_role -- which is the point, because no policy can restrain that role.
Redaction under a legal order stays possible as a deliberate human act: drop the
trigger, redact, re-create it, leaving that sequence in the database logs.

**Dry run against production, rolled back:** UPDATE refused 42501, DELETE
refused 42501, INSERT unaffected.

(The APPLY-ORDER row for 137 claimed "audit-log immutability triggers"; the 137
file contains none. That row was wrong; this file is the real thing.)

## `148_refund_destination.sql`, added 2026-09-02

`refunds` records the notice, the ground, the fee and the 14-day deadline, and
says nothing about WHERE the money went. `refundOrder` has exactly one path,
`provider.refundByTransactionId`, back to the card, so a wallet credit is not a
second option -- it is a thing the code cannot express. That matters for a
voucher already redeemed or expired: the value left at the counter, so pulling
the card money back returns value that was consumed, and a goodwill wallet
credit is the correct instrument.

Adds `public.refund_destination` (`original_method`, `wallet`) and
`refunds.destination NOT NULL DEFAULT 'original_method'`. The default states a
fact rather than a guess: every refund written before this column went back to
the card, because that was the only path.

Plus `refunds_wallet_has_no_fee`: a wallet refund may carry no cancellation fee.
The fee is a deduction from money returned to a payment instrument, and a
goodwill credit that quietly withheld 5% would be a worse product than refusing.

**Dry run against production, rolled back:**

```
card_with_fee=OK   wallet_with_fee=23514_refused   wallet_no_fee=OK
default=['original_method'::refund_destination]
```

**No code ships with it.** `recordRefund` does not send `destination`, because a
write naming a column that does not exist fails 42703 and would take every
refund record with it. The wallet path in `refundOrder` follows in a separate
commit once this is applied.

## `147_money_agorot_remaining_twins.sql`, added 2026-09-01

Generated `_agorot` twins for the last four money columns that had none:
`orders.discount_ils`, `orders.cashback_applied_ils`,
`order_items.supplier_payout_ils` and `order_items.cashback_earned_ils`.

They are the four that still convert in JavaScript, in
`src/lib/commerce/order-money-columns.ts`, on a value that has already crossed a
JSON boundary as a string. Everything else in the read path already reads a
twin and lets Postgres do the multiply against the numeric source.

`generated always as (round(<col> * 100)::bigint) stored`, like the 26 already
live: it cannot drift, and Postgres refuses any write that names it (428C9), so
no writer changes and the numeric column stays the source of truth.

**Dry run against production, in a transaction that was rolled back:** all four
were created, all four reported `is_generated = ALWAYS`, and the arithmetic is
right on real rows (17.10 -> 1710, 759.05 -> 75905). Confirmed afterwards that
zero columns of these names exist in production. The nonneg checks are safe on
current data, measured: minimums 0.00, 0.00, 17.10, 0.00, no negatives.

**No reader changes with it.** A select naming a column that does not exist
fails 42703 and takes the whole row with it. The reader moves in a separate
commit after this is applied.

## `146_wallet_balance_floor.sql`, added 2026-09-01

`check (user_id is null or balance_ils >= 0)` on `wallet_accounts`. A customer
wallet may not go negative; a house account may, because it is the funding side
of every cashback pair. The reasoning, and the measurements behind it, are in
`docs/DECISIONS.md`. The migration refuses to run if any user-owned account is
negative when it is applied.

## The 138-141 vs 142 question is closed

Ofir chose the additive path. `the in-place money migration (deleted 2026-09-01)` has been
deleted, not archived: the two paths produce nine identically-named columns on
the same tables, and a file left in a directory called `pending/` is a file
somebody may apply. The reasoning is in `docs/DECISIONS.md`.

## APPLIED IN PRODUCTION — do not apply again

Verified 2026-09-01 by querying the live database for each migration's own
effect, not by trusting this list. The version string is from
`supabase_migrations.schema_migrations`.

| File | Production version | Applied as | Verified by |
| --- | --- | --- | --- |
| `123_products_whatsapp_enabled.sql` | `20260901013104` | `123_products_whatsapp_enabled` | `products.whatsapp_enabled` exists |
| `130_payment_events.sql` | `20260901013413` | `130_payment_events` | `payment_events` table + `payment_events_no_mutation` trigger |
| `134_order_items_delivered_at.sql` | `20260901013122` | `134_order_items_delivered_at` | `delivered_at` + `shipped_at` + `order_item_cancellation_deadline()` |
| `136_supplier_coordinates.sql` | `20260901013134` | `136_supplier_coordinates` | `suppliers.latitude` + `.longitude` |
| `146_wallet_balance_floor.sql` | `20260901013143` | `146_wallet_balance_floor` | constraint `wallet_accounts_user_balance_floor` |
| `143_revoke_unused_definer_execute.sql` | `20260821041759` | `revoke_orphan_security_definer_grants_125` | all 5 target functions have zero anon/authenticated grants |
| `144_revoke_authenticated_dml.sql` | `20260831140841` | `126_revoke_authenticated_dml` | all 8 target tables have zero anon/authenticated INSERT/UPDATE/DELETE |
| `145_revoke_check_rate_limit_execute.sql` | `20260831184356` | `127_revoke_check_rate_limit_execute` | `check_rate_limit` has zero anon/authenticated EXECUTE |
| `166_voucher_transition_guard.sql` | `20260903232445` | `voucher_transition_guard_166` | `tg_vouchers_status_guard` trigger + `fn_vouchers_status_guard` body match the file (compared 2026-09-04) |
| `167_order_items_money_constraints.sql` | `20260903232455` | `order_items_money_constraints_167` | all 8 `order_items_*_nonneg` constraints + `order_items_money_conservation` exist, expressions match |
| `168_wallet_ledger_client_readonly.sql` | `20260903232504` | `wallet_ledger_client_readonly_168` | the six write policies are gone; only the two SELECT policies remain, RLS enabled on both tables |

**`124_categories_sort_order.sql` is a different case.** `categories.sort_order`
exists in production, so the migration must not be run again, but there is **no
row for it in `schema_migrations` under any name**. The effect is present and the
record is not. Treat it as applied; do not expect to find its version string.

**Two of these needed a precise test, not a broad one.** A schema-wide count of
`authenticated` DML grants returns 144 and looks like `144` never ran. It did:
that migration revokes on a named list of eight tables, and against those eight
the count is zero. The 144 remaining grants are on ordinary catalogue and order
tables, which are protected by RLS rather than by revoking the grant. Measuring
the wrong thing here produces a confident, wrong "not applied".

**The fail-open hazard around `145` is closed.** `check_rate_limit` carries zero
EXECUTE grants for `anon` and `authenticated`, and the limiter runs on the
service-role client, so there is no still-anon caller left to fail open.

## Two files were corrected on disk so the repo matches production

Both were rejected at apply time and fixed during the apply. The versions in
this directory now describe what actually ran.

**`131_refunds.sql`.** `refund_due_by` was

```sql
GENERATED ALWAYS AS (requested_at + interval '14 days') STORED
```

which PostgreSQL rejects: a generation expression must be IMMUTABLE, and
`timestamptz + interval` is only STABLE, because the result depends on the
session `TimeZone`. It is now a plain `timestamptz` plus
`refunds_force_due_by()` on `BEFORE INSERT OR UPDATE`, with
`SET search_path TO ''`.

The guarantee is unchanged: nobody can extend the statutory deadline. What
changed is the failure mode. A generated column **refuses** a write to that
column with `428C9`; the trigger **accepts** the write and silently overwrites
the value. The verification note in the file was corrected to match, because it
still told a reader to expect `428C9`.

**`133_supplier_branches.sql`.** The member-write policy named `m.role`. There is
no such column: it is `member_role`, of enum `supplier_member_role`
(`owner`, `manager`, `scanner`). The applied policy also requires `m.is_active`,
and that addition matters more than the rename. Without it, revoking somebody's
access by clearing the flag would leave them able to write branches, because the
membership row still carries its role. Deactivation has to mean deactivation in
the policy, not only in the UI that stops drawing the button.

## `124`, `143`, `144`, `145` are out of the apply order

All four were confirmed applied in production under their old numbers, and they
sit in the APPLIED table above. `check_rate_limit` holds zero `anon` EXECUTE
grants and `authenticated` holds zero DML on the eight deny-all tables. **There
is no fail-open hazard left to sequence around**, which was the only reason the
apply order previously insisted `145` go last.

## 2026-09-01: two drifts between this directory and production, both closed

Found by querying the live database rather than by reading the migration record.

**`135` is two migrations in production, not one.** `schema_migrations` holds
`135a_product_type_recurring` and `135b_recurring_subscriptions`. The repo
carried a single combined file whose header argued, correctly, that PostgreSQL
17 permits `ALTER TYPE ... ADD VALUE` inside a transaction provided the label is
not used in the same one. The argument holds and the shape was still wrong: the
restriction binds the whole transaction, and nobody applying a later statement
can tell from reading it that `'recurring'` must not be referenced. Split into
`135a_product_type_recurring.sql` and `135b_recurring_subscriptions.sql` so the
constraint is structural instead of a promise kept by a comment.

**`138` describes eight columns; production has six.** What ran was a collapsed,
table-driven version of 138-141. These two were never created:

```
orders.discount_ils_agorot
order_items.supplier_payout_ils_agorot
```

The blocks that would create them are still in the file and still correct, so
running it would add them. Whether that is wanted is left open: the reason they
were dropped from the collapsed version was not recorded, and inventing one in a
migration header is how a wrong reason becomes a fact. A banner at the top of
`138` says all of this, so the file cannot be read as a description of
production without also reading the correction.

**The consequence for the application code.** Four money columns have no
generated twin and therefore still convert in JavaScript:

```
orders.discount_ils              orders.cashback_applied_ils
order_items.supplier_payout_ils  order_items.cashback_earned_ils
```

`src/lib/commerce/order-money-columns.ts` carries the same list at the call
site. The two have to change together.
