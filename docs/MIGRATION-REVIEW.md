# Migration review

Every `.sql` in `migrations/pending/` (19 migrations + 3 preflights), each read
in full and checked against the **live** database `ixvwfbuvfxxsjiywhbbb`
(`supabase_migrations.schema_migrations`, `pg_proc`, `pg_trigger`,
`information_schema`, read 2026-09-08 18:51 UTC).

This supersedes the 2026-09-06 review, which covered five files. Nineteen are
on disk now. **Nothing was applied by this audit.** Apply order and
preconditions stay in `docs/RUNBOOK.md`; approval stays with Ofir.

Columns: **Idempotent** = a second run is a no-op or a NOTICE, never an error.
**DML safe** = the file writes no rows directly; any data movement goes through
a SECURITY DEFINER function or is structural (a table copy). **Live** = what the
database says today, not what the file header says.

---

## 1. The table

| File | Live state | Idempotent | DML safe | Notes |
|---|---|---|---|---|
| `148_orders_monthly_partitioning.sql` | NOT applied (`orders` relkind `r`, not `p`) | **Y** (DO block exits on `pg_partitioned_table`; CREATE TABLE/FUNCTION IF NOT EXISTS / OR REPLACE; `cron.schedule` upserts by name) | **N** (direct `INSERT ... SELECT` copy of `orders` and 16 `UPDATE` backfills of twin columns inside the DO block; structural, row-count-checked, but direct) | HIGH blast radius. Recreates only 3 triggers on `orders`; **`audit_orders` (169, live) is lost**, and so would `tg_orders_whatsapp_status` (173) and `trg_orders_notify_shipped` (183) be. `170_composite` index `orders_user_created_active_idx` is not in its index list either. **177's `REFERENCES orders(id)` becomes impossible after this** (PK is `(id, created_at)`). Needs a rewrite before it is safe to consider; maintenance window only. |
| `149_soft_delete_user_facing_remainder.sql` | NOT applied (0 of 4 `deleted_at` columns exist) | **Y** (`add column if not exists`, `drop policy if exists`, `create index if not exists`) | **Y** (no DML) | Code side shipped first (`src/lib/soft-delete.ts` pending list). After apply: regenerate types, move four names to the live list. |
| `162_cron_schedule.sql` | NOT applied (`cron.job` has 1 row, `report_tables_nightly`) | **Y** (`cron.schedule` upserts by jobname) | **Y** (no DML) | **Will raise on line 1 of its guard: vault holds `CRON_SECRET` and `APP_BASE_URL`, the file expects `cron_secret` and `app_url`.** Also drifts from `scripts/cron-jobs.json`: schedules `ke-retention` + `ke-weekly-digest` (not in the json) and omits `whatsapp` (in the json). Preflight block 3 would catch the name mismatch. Interim scheduler is `.github/workflows/cron.yml`. |
| `169_analytics_server_event_names.sql` | NOT applied (live whitelist has 8 names, no `begin_checkout`) | **Y** (`CREATE OR REPLACE`) | **Y** | **Duplicate of 180**: identical body, identical 12-name list. Keep one. Until applied, `begin_checkout`, `purchase`, `voucher_redeemed`, `order_refunded` are discarded at the door (re-confirmed: body read from `pg_proc`). |
| `169_audit_full_coverage.sql` | **APPLIED** 2026-09-04 (`audit_full_coverage_169`; `before`/`after`/`request_id` present; 34 `audit_*` triggers live) | **Y** (`alter column type` re-cast is a no-op; if not exists; drop trigger if exists) | **Y** (trigger function only) | Stays in `pending/` as the record. |
| `170_composite_indexes_top_queries.sql` | NOT applied (0 of the 10 index names exist) | **Y** (`CREATE INDEX IF NOT EXISTS` only) | **Y** | Plain `CREATE INDEX`, write-locks each table for milliseconds at today's row counts. Preflight `preflight_170.sql` still valid. Index on `orders` is lost if 148 runs later. |
| `170_reporting_tables.sql` | **APPLIED** 2026-09-04 (`reporting_tables_170`; 4 tables + 6 functions live; cron job running, 5/5 succeeded) | **Y** (if not exists / or replace / unschedule-then-schedule guard) | **Y** (all DELETE/INSERT inside `refresh_report_tables()` SECURITY DEFINER; the final `select public.refresh_report_tables()` is a call, not DML) | Record only. |
| `171_category_name_shekel_order.sql` | NOT applied (`under-99` still `עד ₪99`) | **Y** (matched on the exact broken string) | **N** (one direct `UPDATE`, one row, `WHERE` is its own check) | Optional: `getAllCategories` repairs on read. |
| `171_search_fts.sql` | **APPLIED** 2026-09-04 (`search_fts_171`; `products.search_vector` live; `search_products` anon-callable INVOKER) | **Y** | **Y** | Record only. |
| `172_hide_master_product_test_row.sql` | NOT applied (row: `status active`, `kenyon_price 1.00`, `full_price 400`, `stock_quantity 10`) | **Y** (matched on id + exact name) | **N** (one direct `UPDATE`, one row) | Still required. Checkout is blocked by `implausible-discount.ts` (95% threshold) since 09-06; listings that bypass the cart still render it. |
| `172_rls_zero_policy_tables.sql` | **APPLIED** 2026-09-04 (`rls_zero_policy_tables_172` + `_report_grants`; 0 zero-policy tables live) | **Y** (policy existence checked in `pg_policy` before each CREATE) | **Y** | Record only. |
| `173_whatsapp_flow.sql` | NOT applied (none of the 5 tables exist) | **Y** (IF NOT EXISTS / DROP IF EXISTS throughout) | **Y** (enqueue via SECURITY DEFINER `fn_enqueue_whatsapp`; trigger-driven) | Three fixes before apply: (1) the opening `CREATE OR REPLACE FUNCTION public.set_updated_at()` has no `SET search_path` and will re-unpin the live function (advisor WARN); (2) `fn_enqueue_whatsapp` has no `REVOKE ... FROM PUBLIC, anon, authenticated`, so any client can RPC it (consent-gated, still a spam lever); (3) `whatsapp_inbound_messages.ticket_id` is a bare uuid. Adds a 5th trigger to `orders` (see 148). |
| `177_cashback_ledger.sql` | NOT applied (`cashback_ledger` absent) | **Y** (IF NOT EXISTS / OR REPLACE / DROP TRIGGER IF EXISTS; audit trigger attached only if 169 fn exists, and it does) | **Y** (both writers are SECURITY DEFINER functions; ledger is append-only by trigger) | `fn_cashback_admin_adjust` is granted to `authenticated` with an internal `is_admin()` gate, which will add one more row to advisor lint 0029 (same pattern as the payout RPCs). `fn_cashback_ledger_block_mutation` has no `search_path` pin (trigger fn; add one). **Apply before 148** or the `orders(id)` FK cannot be created. |
| `178_webauthn_credentials.sql` | NOT applied | **Y** | **Y** | Same `set_updated_at` unpin block as 173; fix or delete it. Otherwise clean: service-role-only writes by policy omission. |
| `179_push_subscriptions.sql` | NOT applied | **Y** | **Y** | Same `set_updated_at` unpin block. Otherwise clean. |
| `180_analytics_server_event_names.sql` | NOT applied | **Y** | **Y** | Duplicate of `169_analytics_server_event_names.sql`. Inline preflight blocks are correct against the live function (signature `(jsonb, uuid, text, text)`, `prosecdef = true`). |
| `181_admin_rbac_hardening.sql` | NOT applied (`user_role` = 6 values, no `read_only`; `is_support` body is the 053 three-name list; `enforce_profile_privilege_columns` trigger attached) | **Y** (`ADD VALUE IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`) | **Y** | All four inline preflight expectations hold live. Enum member is permanent (rollback caveat stated in the file). `ADD VALUE` inside `apply_migration`'s transaction is legal because the new label is compared as `text` and never referenced as an enum literal in the same file. |
| `182_coupon_qr_batches.sql` | **APPLIED** 2026-09-07 (`coupon_qr_batches_182`; both tables live) | **Y** (exception-guarded constraints) | **Y** | **Its `set_updated_at` redefinition is the root cause of the live `function_search_path_mutable` WARN** (`proconfig` NULL since 09-07; 159 had pinned it 09-03). `coupon_qr_batches.created_by` has no index (advisor INFO). |
| `183_order_shipped_notification.sql` | PARTIALLY live: the CHECK already contains `order_shipped` (and `account_deleted`); `trg_orders_notify_shipped` / `tg_orders_notify_shipped` **absent** | **Y** as written | **Y** (trigger + SECURITY DEFINER enqueue) | **Do not apply as written.** Its `DROP CONSTRAINT` + `ADD CONSTRAINT` restates a 13-name list that lacks `account_deleted`, so it would narrow the live constraint and fail if any `account_deleted` row is queued. Delete section 1 and apply only the function + trigger. Adds a trigger to `orders` (see 148). |
| `preflight_162.sql` | preflight | n/a | read-only | Block 3 will return zero rows today (name mismatch above). Block 5 is a repo test, not SQL. |
| `preflight_169.sql` | preflight | n/a | read-only | Valid. Block 2 answers `false` today (not yet widened). |
| `preflight_170.sql` | preflight | n/a | read-only | Valid. Block 1 answers zero rows today. |

---

## 2. Counts

| | Files |
|---|---|
| Applied and still on disk as the record | 5 (169_audit, 170_reporting, 171_search_fts, 172_rls, 182) |
| Unapplied, safe as written | 8 (149, 170_composite, 171_category, 172_hide, 178\*, 179\*, 180 or 169_analytics, 181) |
| Unapplied, need a fix first | 5 (148, 162, 173, 183, and one of the 169/180 pair to delete) |
| Unapplied, ordering constraint | 1 (177 before 148) |

\* 178 and 179 are safe in effect but carry the `set_updated_at` unpin block; fix it in the same batch as 173.

---

## 3. Idempotency patterns used, for the next author

- `CREATE POLICY` has no `IF NOT EXISTS`: every file here either does `DROP POLICY IF EXISTS` first (149, 173, 177, 178, 179, 181, 182) or checks `pg_policy` in a DO block (172). Both are correct.
- `ALTER TABLE ... ADD CONSTRAINT` has no `IF NOT EXISTS`: 182 wraps each in `BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END`. 183 instead drops and re-adds, which is idempotent but **not additive** (the failure mode in §1).
- `cron.schedule(jobname, ...)` upserts by name in pg_cron >= 1.4 (live 1.6.4), so 148, 162 and 170 are re-runnable.
- `CREATE OR REPLACE FUNCTION` replaces `SET` options too. A defensive redefinition of an existing function must carry the same `SET search_path` the deployed one has, or it silently unpins it (182 did).

---

## 4. Recommended apply order once approved (unchanged in spirit from RUNBOOK, corrected for what was learned)

```
A  172_hide  ->  180 (delete 169_analytics)  ->  170_composite  ->  171_category
B  set_updated_at repin (new one-liner)  ->  173 (fixed)  ->  178  ->  179  ->  181
C  177  ->  183 (trigger half only)
D  149
E  162, after the vault rows are renamed or the file is, and after the json/162 job list is reconciled
F  148, only after a rewrite that recreates every trigger and index now on `orders`, and only in a maintenance window
```
