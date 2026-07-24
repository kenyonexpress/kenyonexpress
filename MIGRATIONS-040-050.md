# MIGRATIONS-040-050

kenyonexpress.co.il. Branch `phase6/complete-architecture`. **Design + migration-file documentation. No UI files.**

This document is the authoritative index for the money-convergence migration set. It records **what each migration does, how it stays idempotent, its rollback path, and whether it is backward compatible or a full replacement.**

## 0. Logical plan → actual file numbers

The original plan numbered these migrations **040–050**. In this tree, numbers `033–035` were already taken (`analytics`, `analytics_bi`, `security_hardening`) and `049` was the last used number, so the files were allocated **050–056** on top of the pre-existing **042** (commerce_core) and **046–047** (checkout runtime / settlement). The mapping is stable and recorded in each file header and in `LEDGER-DESIGN.md §0`.

| Logical (plan) | Actual file | Content |
|---|---|---|
| 040 money numeric → integer agorot (backfill, verify, CHECK) | `059_money_integer_units.sql` | add/backfill/verify/rename every `*_ils` → `*_agorot` |
| 041 percentage → basis points | `059_money_integer_units.sql` (same file) | every `*_percent` → `*_bp` (×100) |
| 042 coupon single-use race-safe | `061_coupon_single_use.sql` | CAS + partial unique + transition guard |
| 043 settlement_batches + items | `062_settlement_batches.sql` | per-supplier batch + item snapshot from order_items |
| 044 reconciliation_runs + discrepancies | `063_reconciliation.sql` | scheduled-integrity run + discrepancy tables |
| 045 ledger (accounts, journals, lines, RLS) | `058_ledger_core.sql` (+ RLS in `056`) | double-entry core with sum-zero + immutability |
| 046 idempotency_keys | `060_idempotency_keys.sql` | generic `(scope, key)` store |
| 047 payment_webhook_events immutability | see §3.8 | dedup UNIQUE exists (046); append-only hardening documented as a gap-fill |
| 048 indexes for hot paths | see §3.9 | partial indexes across 042/046/047 + MASTER §5.4 plan |
| 049 RLS complete | `064_money_rls.sql` | RLS on every new money table |
| 050 production checklist | `DEPLOYMENT.md` | ship gates (not a SQL file) |

Foundational commerce/checkout migrations this set builds on: **`042_commerce_core.sql`** (agorot columns, commission_ledger, cashback), **`046_checkout_runtime.sql`** (payments, webhook events, tokens, wallet accounts/entries), **`047_checkout_settlement.sql`** (escrow_holds, split_executions — **legacy in runoff**).

## 1. Universal idempotency rules (per `supabase-migrations` skill)

Every file in this set obeys, so a re-run is a no-op, never an error:

- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Enums added by `ADD VALUE` guarded with `IF NOT EXISTS`; new enum types created inside a `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; $$` block.
- Functions via `CREATE OR REPLACE FUNCTION`.
- Triggers dropped then created (`DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`) — Postgres has no `CREATE OR REPLACE TRIGGER` pre-14 semantics we rely on.
- RLS policies dropped-if-exists then created.
- Money backfills only touch rows where the new column `IS NULL`, and verify with a `DO` block that `RAISE EXCEPTION`s on drift — so partial prior runs converge.

**Apply discipline:** files only. Apply to a live DB solely via the approved `apply_migration` MCP path, never `db push`. Nothing in this set has been applied to any database.

## 2. Money-unit convention (the spine of the set)

- Every internal amount is `integer` agorot (`bigint` on ledger tables, where long-run per-account accumulation can exceed int4). One currency: ILS. No new `numeric` money.
- Every rate is `integer` basis points: 10% = 1000 bp, 100% = 10000 bp. Same ×100 conversion as money.
- Rounding: `round(amount_agorot * bp / 10000.0)::integer` (Postgres half-up on positive numeric) at every amount×rate multiplication.
- VAT (17%) carried as `vat_rate_bp` (default 1700); extraction `net = round(gross*10000/11700)`, `vat = gross - net`.

## 3. Per-migration reference

### 3.1 `058_ledger_core.sql` — ledger (plan 045)

**Adds:** enums `ledger_account_kind`, `ledger_side`, `ledger_event`; tables `ledger_accounts`, `ledger_journals`, `ledger_journal_lines`; functions `fn_ensure_ledger_account`, `fn_ledger_check_journal_balance`, `fn_ledger_block_mutation`. Seeds the three global accounts (`platform_revenue`, `cardcom_clearing`, `vat_output`).

**Key constraints:** `ledger_journal_lines.amount_agorot bigint CHECK (<> 0)` (signed: +debit/−credit); `ledger_journals.event_key UNIQUE` (event idempotency); `reverses_journal_id UNIQUE` (one reversal per journal); `vat_rate_bp` CHECK 0–10000; per-owner partial unique indexes on accounts (global/supplier/user).

**Sum-zero:** `trg_ledger_lines_balanced` — a `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` firing at COMMIT, aggregating all lines of a journal; aborts the whole transaction if the sum ≠ 0. Chosen because a CHECK cannot aggregate across rows.

**Immutability:** `BEFORE UPDATE/DELETE/TRUNCATE` triggers on both journal tables raise unconditionally — **including for service_role** (this is the real enforcement; RLS does not bind service_role). Corrections only via a `reversal` journal.

**Idempotency:** guarded enum/table/index creates; seed uses `ON CONFLICT DO NOTHING`. **Rollback:** drop triggers, then `ledger_journal_lines`, `ledger_journals`, `ledger_accounts`, then the three functions and three enums. **Compatibility:** purely additive; no existing table altered. New subsystem, safe to ship ahead of code that posts to it.

### 3.2 `059_money_integer_units.sql` — agorot + basis points (plan 040+041)

**Strategy per column** (helper `fn_money_col_to_int(table, old, new, verify)`, dropped at file end):
1. `ADD COLUMN IF NOT EXISTS <new> integer`.
2. `UPDATE ... SET new = round(old*100)::integer WHERE new IS NULL AND old IS NOT NULL`.
3. `DO` block: `RAISE EXCEPTION` if any row has `new IS DISTINCT FROM round(old*100)`.
4. `RENAME old -> old||'_legacy'` and `DROP NOT NULL` on the legacy column.

**Scope:** `payments` (`amount_ils`, `wallet_applied_ils`), `coupon_codes` (`face_value`, `platform_paid`, `collect_amount`), `orders`, `order_items` (all `_ils` + `platform_percent`/`commission_percent`/`cashback_percent` → `_bp`), `wallet_balances`, `wallet_transactions`, `wallet_accounts`, `wallet_entries`, `products`, `product_variants`, `coupon_redemptions`, `coupon_deals`, `suppliers.commission_percent`, `vendors.commission_rate`. Also redefines `product_platform_percent` and adds `product_platform_bp` (default 1000 bp).

**Special cases:** `coupon_deals.platform_price`/`discount_percentage` are GENERATED — dropped and recreated as `platform_price_agorot`/`discount_bp`. Columns whose agorot twin was already created by **042** with richer formulas (`orders.subtotal_agorot`, `order_items.unit_price_agorot`, …) pass `verify => false`: 042 owns their backfill; 051 only fills NULLs and renames the ils column away.

**Idempotency:** add-if-null + verify makes re-runs converge; renames are guarded by the helper checking column existence. **Rollback (per column):** `DROP COLUMN <new>; RENAME <old>_legacy TO <old>` (restore NOT NULL manually where it existed); recreate the two `coupon_deals` generated columns and the 027 `product_platform_percent`. No data destroyed except the two recomputable generated columns.

**Compatibility — the one breaking edge:** SQL functions that reference old column names by text (the 027 settlement functions) break after rename. `product_platform_percent` is redefined here; the 027 functions are legacy-in-runoff and are redefined/retired in a future cleanup migration. **Code cutover (server actions reading `*_agorot`/`*_bp`) is a hard precondition to applying 051 in production** (LEDGER §12). This is the highest-risk migration in the set — treat as "backward compatible only after code cutover," otherwise a full replacement of the money column contract.

### 3.3 `060_idempotency_keys.sql` — generic idempotency (plan 046)

**Adds:** `idempotency_keys (scope, key, response_hash, expires_at default now()+24h)`; UNIQUE `(scope, key)`; index on `expires_at`. RLS **enabled with zero policies** (default deny; service_role only). Complements — does not replace — the dedicated keys already on `payments`, `ledger_journals`, `wallet_entries`, `wallet_transactions`, `commission_ledger`, and the webhook dedup unique.

**Cleanup:** delete expired rows via `pg_cron`/scheduled function (backed by the `expires_at` index); never from a request handler. **Idempotency:** guarded creates. **Rollback:** `DROP TABLE idempotency_keys`. **Compatibility:** purely additive.

### 3.4 `061_coupon_single_use.sql` — race-safe redemption (plan 042)

**Adds:** `coupon_codes.redeemed_by_merchant_user_id` (FK, SET NULL); partial unique index `coupon_codes_one_used_per_code ON (code) WHERE status='used'`; `coupon_redemptions` (idempotent create) with `coupon_code_id UNIQUE` + a second unique index; transition-guard trigger `trg_coupon_codes_guard_transitions` (BEFORE UPDATE) blocking any exit from a terminal state (`used`/`expired`/`refunded`) and freezing redemption facts.

**Three defense layers:** (1) CAS `UPDATE ... WHERE status='issued' AND expires_at>now()` — the loser sees 0 rows → `already_used`; (2) `coupon_redemptions.coupon_code_id` UNIQUE — one redemption fact ever; (3) partial unique on `(code) WHERE status='used'` — survives even a future weakening of global code uniqueness.

**Idempotency:** guarded creates; `DROP TRIGGER IF EXISTS` before `CREATE`. **Rollback:** drop the trigger, the two unique indexes, the added column; leave `coupon_redemptions` if 026 already created it. **Compatibility:** additive + strictly-tightening constraints; safe if existing data already satisfies single-use (verify first with INV-4).

### 3.5 `062_settlement_batches.sql` — per-supplier settlement (plan 043)

**Adds:** enum `settlement_batch_status` (draft/pending_approval/approved/paid/cancelled); tables `settlement_batches` (bigint agorot, `net_due = gross - commission` CHECK, UNIQUE `(supplier_id, period_start, period_end)`) and `settlement_items` (`order_item_id UNIQUE` across all batches, `platform_bp` NOT NULL, `gross = commission + net` CHECK); function `fn_build_settlement_batch`; trigger `trg_order_items_snapshot_lock`.

**Snapshot rule (the invariant this file exists to guarantee):** `fn_build_settlement_batch` selects only **physical, delivered ≥ 14 days, unsettled** items and copies `platform_bp`, `gross_agorot`, `commission_agorot`, `net_agorot` **exclusively from `order_items`** — no join to `products`. `trg_order_items_snapshot_lock` freezes those snapshot columns once the order is paid, so the settlement snapshot always equals the purchase snapshot (checked by INV-3).

**Idempotency:** guarded creates; `fn_build_settlement_batch` idempotent per `(supplier, period)` via the batch unique + `settlement_items.order_item_id` unique. **Rollback:** drop trigger, `settlement_items`, `settlement_batches`, function, enum. **Compatibility:** additive; supersedes draft `supplier_payouts`/`payout_statements` (026/027) which stay read-only until archived.

### 3.6 `063_reconciliation.sql` — integrity job tables (plan 044)

**Adds:** enums `recon_run_status` (running/succeeded/failed), `recon_severity` (info/warning/critical); tables `reconciliation_runs` (`run_type`, counters, `finished_at` CHECK tied to status) and `reconciliation_discrepancies` (`expected_agorot`, `actual_agorot`, `delta_agorot` GENERATED = actual − expected, `entity_table`/`entity_id`, resolution fields). Partial indexes for running runs and open discrepancies.

The queries in `INVARIANTS.md` are exactly what these jobs run: one violating row → one `reconciliation_discrepancies` row with the matching `run_type`. **Idempotency:** guarded creates. **Rollback:** drop the two tables and two enums. **Compatibility:** additive.

### 3.7 `064_money_rls.sql` — RLS complete (plan 049)

**Adds/asserts RLS** on every new money table: `ledger_accounts` (admin read; owner reads own `customer_wallet`), `ledger_journals`/`ledger_journal_lines` (admin read; wallet owner reads lines touching own account; **no write policies**), `settlement_batches`/`settlement_items` (admin read; writes service-role only), `reconciliation_runs`/`reconciliation_discrepancies` (admin read), `idempotency_keys` (no policies). Restates owner/admin policies on `coupon_redemptions`.

**Layering:** RLS is the second line for money tables — the first is the immutability triggers (050) and function-only writes, which bind even service_role. **Idempotency:** `DROP POLICY IF EXISTS` then `CREATE POLICY`; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is idempotent. **Rollback:** drop the added policies (or `DISABLE ROW LEVEL SECURITY` per table — not recommended). **Compatibility:** tightens access; additive to reads, default-deny for writes.

### 3.8 Payment-webhook immutability (plan 047)

`payment_webhook_events` (046) already provides the load-bearing guarantee: `UNIQUE (provider, external_event_id)` (replay = no-op) + `verified_against_api` + admin-read-only RLS with no client write. Append-only hardening equivalent to the ledger tables (a `BEFORE UPDATE/DELETE` block trigger) is **not yet present** and is called out as **P1 gap G1** — add it in a follow-up so a service-role bug cannot rewrite webhook evidence. Until then, immutability rests on RLS + the dedup unique, which is sufficient for correctness but not for tamper-evidence.

### 3.9 Hot-path indexes (plan 048)

Distributed across the foundational files rather than one migration; the target set (MASTER §5.4) is:

- `orders (user_id, created_at DESC)` partial `deleted_at IS NULL`; `orders (expires_at)` partial `status='pending' AND paid_at IS NULL` (present, 047/026).
- `order_items (order_id)`, `(supplier_id, item_status)`.
- `payments (idempotency_key)` UNIQUE, `(cardcom_transaction_id)` UNIQUE, `(cardcom_low_profile_id)` (present, 046).
- `coupon_codes (code)` UNIQUE, `(supplier_id, status, expires_at)`, partial `(expires_at) WHERE status='issued'` (present, 046/053).
- `coupon_redemptions (coupon_code_id)` UNIQUE (present, 053).
- `wallet_entries (idempotency_key)` UNIQUE (present, 046).
- `ledger_journals (event_key)` UNIQUE, `ledger_journal_lines (journal_id)`, `(account_id)` (present, 050).
- `settlement_items (order_item_id)` UNIQUE, `(batch_id)` (present, 054).
- `products (slug)` partial-unique active, `(supplier_id)`, GIN `search_vector`.
- `payment_webhook_events (provider, external_event_id)` UNIQUE (present, 046).

**P2 gap G2:** confirm `order_items (supplier_id, item_status)` and `products` GIN index exist; add in the index follow-up if missing.

## 4. Apply order and gates

Apply in file-number order **050 → 056**, each preceded by its INVARIANTS check on staging:

1. `050` ledger core → run INV-1 (trivially passes, no journals yet).
2. `051` money units → **requires code cutover merged first**; run the 051 internal verify (it self-aborts on drift); then re-run all catalog/order reads in staging.
3. `052` idempotency → additive.
4. `053` coupon single-use → run INV-4 **before** to confirm existing data is single-use.
5. `054` settlement → run INV-3, INV-5 after first batch build.
6. `055` reconciliation → wire the INVARIANTS queries into the run jobs.
7. `056` RLS → run the access smoke tests (anon cannot read money tables; owner reads own wallet lines).

Pre-deploy gate for the whole set: every `INVARIANTS.md` query returns zero rows on staging (see `DEPLOYMENT.md §Gates`).

## 5. Known gaps (tracked)

| ID | Gap | Severity | Fix |
|---|---|---|---|
| G1 | `payment_webhook_events` lacks append-only block trigger | P1 | Add `BEFORE UPDATE/DELETE` block trigger (mirror 050) |
| G2 | Verify `order_items (supplier_id, item_status)` + products GIN index | P2 | Index follow-up migration |
| G3 | `escrow_holds` / `split_executions` (047) still present as runoff | P2 | Archive migration after INV confirms no open `held` rows |
| G4 | Two operational wallet systems (026 `wallet_transactions` + 046 `wallet_entries`) | P2 | Unify to one in a cleanup migration; ledger is the accounting SoT meanwhile |
| G5 | 051 `*_legacy` columns linger until code cutover proven | P3 | Cleanup migration drops legacy + adds NOT NULL/CHECK to new columns |

End of MIGRATIONS-040-050.
