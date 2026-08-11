# DB Drift Audit

Audit of the gap between `supabase/migrations/` and the live remote Postgres
(project `ixvwfbuvfxxsjiywhbbb`, eu-north-1, Postgres 17.6).

Captured 2026-07-28. **Documentation only.** Nothing here was executed against
the database beyond read-only introspection of `information_schema`, `pg_type`,
`pg_proc` and `supabase_migrations.schema_migrations`.

## Method

1. Inventoried every base table, view, enum and function in schema `public` on
   the remote.
2. Extracted every `CREATE TABLE / TYPE / VIEW / FUNCTION` from all 86 files in
   `supabase/migrations/`, mapping each object back to the file that declares it.
3. Normalised the two sides (`type` -> `enum`, `materialized view` -> `view`) and
   diffed them in both directions.
4. Ran the shadowing analysis from `src/lib/db/enum-declarations.ts` over all
   migration files.

Regex extraction has a known blind spot: it matches `CREATE TABLE ...` written
inside comments. Six such false positives were identified and excluded
(`public`, `race`, `sees`, `with`, `statements`, `cannot`).

## Headline

| | count |
|---|---|
| objects declared across all migrations | 271 |
| objects present on the remote | 86 |
| **missing on the remote** | **185** |
| present on the remote but declared nowhere | **0** |

The zero in the last row is the reassuring one: nothing was hand-created outside
the migration files, so the migration directory is a complete description of
intent and can be trusted as the repair baseline.

## Why the CLI cannot fix this

The remote `schema_migrations` table records 28 rows, all with 14-digit
timestamp versions (`20260707225659 025_consolidation`, through
`20260727054952 057_wp_migration_log`). The local files are numbered `001`
through `091`. The Supabase CLI derives a migration's version from the digits
before the first underscore, so it sees local versions `001`, `026`, `091` and
finds none of them in the remote history.

Consequences:

- `supabase db push` treats all 86 local files as pending.
- Because every local version sorts *before* the last applied remote version,
  the CLI refuses and demands `--include-all`.
- Forcing it would replay `001_initial_schema.sql` onto a database that already
  holds a partial version of that state.

Until the numbering is reconciled (either `supabase migration repair --status
applied` for each already-live migration, or renaming local files to timestamp
form), the only safe channel is targeted `apply_migration` calls.

Note that `apply_migration` records its own timestamp version, so each such call
widens this gap. That is an accepted tradeoff, not an oversight.

## Per-file status

Files not listed are fully applied.

| file | objects | present | missing | status |
|---|---|---|---|---|
| `027_suppliers.sql` | 32 | 7 | 25 | partial |
| `031_notifications.sql` | 28 | 1 | 27 | partial |
| `033_analytics.sql` | 23 | 1 | 22 | partial |
| `030_catalog.sql` | 15 | 1 | 14 | partial |
| `028_agents.sql` | 14 | 1 | 13 | partial |
| `029_accounts.sql` | 14 | 1 | 13 | partial |
| `034_analytics_bi.sql` | 12 | 1 | 11 | partial |
| `042_commerce_core.sql` | 11 | 1 | 10 | partial |
| `058_ledger_core.sql` | 11 | 1 | 10 | partial |
| `026_commerce.sql` | 16 | 9 | 7 | partial |
| `035_security_hardening.sql` | 7 | 0 | 7 | not applied |
| `056_analytics_v3.sql` | 7 | 0 | 7 | not applied |
| `062_settlement_batches.sql` | 6 | 1 | 5 | partial |
| `051_payout_terms.sql` | 4 | 0 | 4 | not applied |
| `063_reconciliation.sql` | 5 | 1 | 4 | partial |
| `001_initial_schema.sql` | 23 | 20 | 3 | partial |
| `061_coupon_single_use.sql` | 2 | 0 | 2 | not applied |
| `086_triggers_post_059_money_columns.sql` | 2 | 0 | 2 | not applied |
| `059_money_integer_units.sql` | 3 | 1 | 2 | partial |
| `003_rbac.sql` | 6 | 5 | 1 | partial |
| `012_categories_v2.sql` | 1 | 0 | 1 | not applied |
| `017_hero_slides.sql` | 1 | 0 | 1 | not applied |
| `060_idempotency_keys.sql` | 2 | 1 | 1 | partial |
| `065_fn_post_journal.sql` | 1 | 0 | 1 | not applied |
| `079_payout_escrow_release.sql` | 1 | 0 | 1 | not applied |
| `081_payout_no_escrow.sql` | 1 | 0 | 1 | not applied |
| `085_voucher_scan_audit_and_no_escrow.sql` | 3 | 2 | 1 | partial |

"Partial" is often an artifact of shared declarations: an enum declared in both
`001` and `005` counts as present for both files. Read the missing column, not
the ratio.

## The supplier payout chain

This is the subsystem that is actually dead, and it all hangs off `027`.

### Enums

Applied 2026-07-28 as `091_supplier_payout_enums`:
`supplier_status`, `supplier_application_status`, `payout_status`,
`payout_line_type`, `dispute_status`, `scan_result`.

Still missing: **`settlement_match_status`** (`027:61`, values `unmatched`,
`matched`, `amount_mismatch`). It was named in the blocking chain but omitted
from the SQL that was applied.

### Tables, all missing

| table | declared in |
|---|---|
| `supplier_payouts` | `026_commerce.sql` |
| `supplier_payout_items` | `026_commerce.sql` |
| `payout_statements` | `027_suppliers.sql` |
| `payout_statement_lines` | `027_suppliers.sql` |
| `supplier_applications` | `027_suppliers.sql` |
| `supplier_bank_accounts` | `027_suppliers.sql` |
| `supplier_disputes` | `027_suppliers.sql` |
| `cardcom_settlements` | `027_suppliers.sql` |
| `cardcom_settlement_txns` | `027_suppliers.sql` |
| `coupon_scan_events` | `027_suppliers.sql` |

### Functions, all missing

| function | declared in |
|---|---|
| `generate_payout_statement` | `027`, then redefined by `051`, `079`, `081` |
| `approve_payout_statement` | `027_suppliers.sql` |
| `mark_payout_statement_paid` | `027_suppliers.sql` |
| `cancel_payout_statement` | `027_suppliers.sql` |
| `approve_supplier_application` | `027_suppliers.sql` |
| `reject_supplier_application` | `027_suppliers.sql` |
| `reconcile_cardcom_settlement` | `027_suppliers.sql` |
| `update_shipping_status` | `027_suppliers.sql` |
| `redeem_coupon` / `expire_coupons` | `027_suppliers.sql` |
| `payout_available_at` | `051_payout_terms.sql` |
| `enforce_payout_availability` | `051_payout_terms.sql` |
| `add_business_days` | `051_payout_terms.sql` |

### Blocker on 027

`027_suppliers.sql:3` reads `DRAFT: do NOT apply yet`, and its header declares
dependencies on migrations 016 and 019. That file holds most of the payout
engine. It cannot be applied until someone confirms the draft marker is stale.

## Other missing subsystems

Grouped by what they break, largest first.

- **Notifications** (`031`, 27 objects): entire outbox, templates, consent,
  delivery events, marketing windows, fanout. Nothing of it exists.
- **Analytics** (`033`, `034`, `056`, ~40 objects): event ingestion, partitions,
  daily rollups, every `v_*` reporting view, both materialized views.
- **Catalog and search** (`030`, 14 objects): `search_products`,
  `autocomplete_products`, `he_tsquery`, facets, synonyms, SEO redirects,
  product/category joins.
- **Accounts** (`029`, 13 objects): account deletion requests, notification
  preferences, guest cart merge, default payment token.
- **AI agents** (`028`, 13 objects): agent runs, steps, prompts, flags,
  escalations, listing drafts.
- **Double-entry ledger** (`058`, `065`, 11 objects): ledger accounts, journals,
  journal lines, balance checks, `fn_post_journal`.
- **Commerce core** (`042`, 10 objects): commission ledger and the whole cashback
  lifecycle (credit, reverse, reversal debts).
- **Settlement batches** (`062`) and **reconciliation** (`063`).
- **Security hardening** (`035`, 7 objects): `security_events`, role-change
  privilege enforcement, bank account auditing, seed guards.
- Singles: `hero_slides` (`017`), `idempotency_keys` (`060`), `wallets` (`001`),
  `admin_audit_log` (`003`), `generate_order_number` (`001`),
  `coupon_redemptions` (`026`/`061`), `product_categories` (`030`).

## Enum conflicts across all migrations

Produced by the shadowing analysis in `src/lib/db/enum-declarations.ts`.

The house idempotency guard is:

```sql
DO $$ BEGIN CREATE TYPE ... AS ENUM (...);
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

It cannot distinguish "already applied" from "a type of this name exists with
different values". When two files declare the same enum, the first to run wins
permanently and the second is swallowed in silence. A value that only ever
appears in the losing declaration does not exist at runtime, and writing it
raises `22P02` far from the migration that believed it added it.

A file that runs `DROP TYPE IF EXISTS` before its `CREATE` is not shadowed; it
supersedes. `006`, `007` and `008` do this deliberately.

**17 enums are declared more than once. 43 enums exist in total.**

### Genuinely divergent declarations

| enum | file | values |
|---|---|---|
| `coupon_status` | `001` | active, redeemed, expired |
| | `008` **(DROPs first, wins)** | issued, used, expired, refunded |
| | `046` | issued, used, expired, refunded |
| `order_status` | `001` | pending, paid, processing, shipped, delivered, cancelled, refunded |
| | `007` **(DROPs first, wins)** | pending, paid, partially_fulfilled, fulfilled, cancelled, refunded |
| `wallet_tx_type` | `001` | cashback_earned, order_payment, refund, adjustment |
| | `006` **(DROPs first, wins)** | earn, redeem, expire, refund |
| `product_status` | `001` **(wins)** | draft, active, paused, archived |
| | `005` | draft, active, paused, sold_out, archived |
| | repaired by | `ALTER TYPE ... ADD VALUE 'sold_out'` (084) |
| `product_type` | `001` **(wins)** | physical, coupon |
| | `005` | coupon, physical, **service** |
| | partially repaired by | `ALTER TYPE ... ADD VALUE 'subscription'` |
| `payout_status` | `026` **(would have won)** | draft, approved, paid, cancelled |
| | `027` | draft, pending_approval, approved, paid, cancelled |
| | repaired by | `ALTER TYPE ... ADD VALUE 'pending_approval'` (083) |
| | resolved by | `091` applying the 5-value superset first |
| `payment_status` | `026` | initiated, redirected, succeeded, failed, **cancelled**, refunded |
| | `046` | initiated, redirected, succeeded, failed, refunded |
| `payment_kind` | `026` | charge, **token_charge**, refund |
| | `046` | charge, refund |
| `user_role` | `001`, `003` | customer, content_uploader, vendor, admin, super_admin |
| | repaired by | `ALTER TYPE ... ADD VALUE 'support'` |

### Identical redeclarations, harmless

`dispute_status`, `payout_line_type`, `scan_result`, `supplier_status`,
`supplier_application_status` (`027` and `091`); `supplier_member_role` (`027`
and `072`); `voucher_status` and `voucher_scan_outcome` (`054` and `073`).
Byte-identical value lists, so the guard swallowing the second is correct.

### Unreachable values

Exactly one survives static analysis:

> **`product_type.service`** is declared in `005_products_schema.sql`, shadowed
> by `001_initial_schema.sql`, and no `ALTER TYPE` ever adds it. Any code path
> writing `'service'` as a product type raises `22P02`.

### Drift-specific conflicts the static scan cannot see

The scanner assumes migrations run in file order. This database did not do that,
which creates two conflicts that only exist here:

1. **`payment_status` is missing `cancelled`.** The remote holds
   `initiated, redirected, succeeded, failed, refunded`, matching `046`, because
   `046` ran and `026` never did. The static scan says `026` wins by order, so
   it reports no problem. On this database `cancelled` simply does not exist.
   Currently inert: no code path writes it. `checkout.ts:522` writes
   `'cancelled'` to `orders.status`, which is a valid `order_status` value.

2. **`payment_kind` is missing `token_charge`** for the same reason. Also inert:
   `token_charge` appears nowhere in `src/`.

Both become live bugs the moment `026` is applied in a form that assumes its own
declaration won, or the moment code starts writing those literals.

## Recommended order of repair

Not executed. Listed for review.

1. `settlement_match_status` enum, to close the gap `091` left.
2. Resolve the `027` draft marker. Everything downstream is blocked on it.
3. `026` + `027` tables, enums first, then tables, then functions.
4. `051` payout terms, which redefines `generate_payout_statement`.
5. `079` / `081`, in that order, since `081` is the current escrow-free form.
6. `083` is now a no-op and can be skipped or applied harmlessly.
7. `ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'service'` if the
   value is genuinely wanted; otherwise delete it from `005`.
8. Everything else by subsystem, lowest dependency first: `035` security,
   `060` idempotency, `058`/`065` ledger, `042` commerce core, `030` catalog,
   `029` accounts, `031` notifications, `033`/`034`/`056` analytics.

## Numbering caveat

`085` through `090` were authored on 2026-07-28 by a parallel session and are
partially reflected on the remote already: `voucher_scan_outcome` and
`log_voucher_scan` from `085` are live, while `voucher_scan_ip` from the same
file is not. Treat `085` as half-applied and re-verify before touching it.
