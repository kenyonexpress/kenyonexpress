# Apply order

**Nothing here is applied by an agent.** Each file goes to production through
MCP `apply_migration`, one at a time, after Ofir approves it. `db push` is
forbidden by project rule.

Twelve files in this directory are **already in production** and are not listed
below. See the "APPLIED IN PRODUCTION" table in `README.md`, which carries the
version string and the query that proved each one. Running any of them again is
at best a no-op and at worst an error.

## The thirteen that remain, in order

Order matters only where a **depends on** column is filled. Everything else is
independent and may be applied in any sequence, or not at all.

| # | File | What it does | Depends on | Rollback |
| --- | --- | --- | --- | --- |
| 1 | `122_deny_all_on_server_only_tables.sql` | explicit restrictive deny on 5 server-only tables | — | `drop policy deny_all_client_roles on <table>` |
| 2 | `125_expire_vouchers_drop_escrow.sql` | voucher expiry, drops the dead escrow promise | — | in file header |
| 3 | `126_percent_range_checks.sql` | `check (0 <= x <= 100)` on 12 percent columns | — | `drop constraint <table>_<col>_range` |
| 4 | `127_homepage_cms.sql` | homepage CMS tables | — | in file header |
| 8 | `135_recurring_subscriptions.sql` | `recurring` enum member, `subscriptions`, billing columns | — | in file header |
| 9 | `137_order_transition_guard.sql` | order state transition guard + audit-log immutability triggers | — | `drop trigger audit_log_no_delete on public.audit_log` |
| 10 | `138_money_agorot_money_path.sql` | `_agorot` columns on orders, order_items, payments | — | `drop column <col>_agorot` |
| 11 | `139_money_agorot_wallet.sql` | `_agorot` columns on the wallet tables | — | `drop column <col>_agorot` |
| 12 | `140_money_agorot_catalog.sql` | `_agorot` columns on products, variants, coupons | — | `drop column <col>_agorot` |
| 13 | `141_money_agorot_growth.sql` | `_agorot` columns on affiliates, referrals | — | `drop column <col>_agorot` |
| 14 | `147_money_agorot_remaining_twins.sql` | the last four money columns with no generated twin | — | `drop column <col>_agorot` |
| 15 | `148_orders_monthly_partitioning.sql` | monthly range partitioning of `orders`, composite FKs on 16 tables | `137` | in file header |
| 16 | `149_soft_delete_user_facing_remainder.sql` | `deleted_at` + RLS filter on categories, product_images, reviews, wishlists | — | in file header |
| — | `169_audit_full_coverage.sql` | **already applied 2026-09-04** (MCP, `audit_full_coverage_169`): audit_log before/after/request_id + triggers on all financial/user tables | — | in file header |

## The money set, 138 through 141

These four are **one change in four files** and should be applied together.

They are additive: each adds `<col>_agorot bigint`, backfills it with
`round(<col> * 100)`, constrains it, and leaves the original column untouched.
**Applying them is a no-op for the running application** — no reader sees a
different value, because no reader knows the new columns exist yet.

The full sequence, of which applying these is only step one:

```
1. apply 138-141          a no-op for the running app
2. deploy the readers     pointing at the _agorot columns
3. verify in production   both representations live and comparable
4. drop the numeric cols  a separate migration, written later
```

Step 2 cannot start before step 1 is applied, because the columns do not exist
until then and any query naming them fails.

The in-place alternative was deleted on 2026-09-01. It renamed as it converted,
which breaks every reader at the instant of apply with no deploy window and no
rollback without downtime. The two paths produced nine identically-named columns
on the same tables, so they were never combinable. Reasoning in
`docs/DECISIONS.md`.

## Two that refuse rather than corrupt

`126` raises if any percent column already holds a value outside 0..100, instead
of constraining bad data into place.

`146` (already applied) raises if any user-owned wallet account is negative. A
house account, `user_id is null`, is allowed to be negative: it is the funding
side of every cashback pair.

## Rollback in general

Every file carries its own `-- ROLLBACK` header with the exact statements. The
additive money migrations are the cheapest to reverse — dropping a column no
code reads yet costs nothing. The trigger and constraint migrations are next.
`135` is the most expensive, because it adds an enum member, and PostgreSQL
cannot drop one.

## Renumbering note

The table above keeps its original numbering column even though rows were
removed as migrations were applied, so a row's number is a stable reference in
conversation rather than a position. What is authoritative is the file list: ten
files, and the APPLIED table in `README.md` holds the other twelve.
