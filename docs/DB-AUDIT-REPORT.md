# DB Audit Report

Read-only audit of Supabase project `ixvwfbuvfxxsjiywhbbb` (PostgreSQL 17.6),
run through the Supabase MCP (`get_advisors` + `execute_sql`) on
**2026-09-08 18:51 UTC**. Nothing was changed. Every number below is what the
database answered at that time, not what any document claims.

Companion reports produced in the same pass: `SCHEMA-VALIDATION.md`,
`MIGRATION-REVIEW.md`, `CARDCOM-AUDIT.md`, `SECRET-KEY-ROTATION-PLAN.md`,
`BUSINESS-RULES-MATRIX.md`.

---

## 1. Verdict

| Gate | Requirement | Measured | Result |
|---|---|---|---|
| Security advisors | 0 WARN | **23 WARN findings in 3 lints** | **FAIL** (1 real regression, 22 accepted-by-design, see 2.1) |
| Performance advisors | note `unused_index` INFO and connections INFO | 174 unused_index INFO, 1 unindexed FK INFO, 15 multiple_permissive_policies WARN, 1 auth connections INFO | noted, none blocking |
| RLS on all tables | 100% | **73 / 73 public tables (100%)**, 14 / 14 `wp_import` tables (100%) | PASS |
| Zero-policy RLS tables | 0 | 0 | PASS |
| EXECUTE grants to anon/authenticated on sensitive functions | none | 2 anon (accepted), 20 authenticated (all self-gating) | PASS with notes |
| Policy count | reported | **148** policies on `public` | reported |

**The goal brief said "52 tables". Production has 73 tables in `public`**
(plus 12 views, 0 materialized views) and 14 in `wp_import`. The 52 figure is
stale; the coverage claim below is against the real count.

---

## 2. Security advisors

### 2.1 The three lints, classified

| Lint | Level | Count | Classification |
|---|---|---|---|
| `function_search_path_mutable` | WARN | 1 (`public.set_updated_at`) | **REAL REGRESSION.** Migration 159 (applied 2026-09-03) pinned `search_path = pg_catalog, public` on this function. `pg_proc.proconfig` is now **NULL**. Root cause: `182_coupon_qr_batches.sql`, applied 2026-09-07, opens with a "defensive" `CREATE OR REPLACE FUNCTION public.set_updated_at()` that carries no `SET search_path`, and `CREATE OR REPLACE` replaces the whole definition including its config. The same block sits in pending 173, 178 and 179, so the regression will recur three more times unless those blocks are fixed first. |
| `anon_security_definer_function_executable` | WARN | 2 (`is_admin()`, `is_supplier_member(uuid)`) | **ACCEPTED BY DESIGN.** Revoking was migration 165, cancelled 2026-09-04 (CLOSEOUT §13): 18 RLS policies on anon-readable tables call these helpers inside USING, quals run as the caller, so the revoke turns every anonymous catalogue SELECT into 42501. Both return false with no uid. Regression net: `src/db/__tests__/anon-catalog.test.ts`. |
| `authenticated_security_definer_function_executable` | WARN | 20 | **ACCEPTED, each verified.** See 2.2. |

### 2.2 The 20 authenticated-callable SECURITY DEFINER functions

Each was checked for an internal gate (body read from `pg_proc.prosrc`).

| Function | Internal gate | Why the grant exists |
|---|---|---|
| `admin_refresh_reports()` | `is_admin()` first line, 42501 otherwise | admin UI "refresh now" (170) |
| `admin_report_cohort_retention()` | `is_admin()` | admin dashboard RPC (170) |
| `admin_report_orders_daily(date,date)` | `is_admin()` | admin dashboard RPC (170) |
| `admin_report_revenue_daily(date,date)` | `is_admin()` | admin dashboard RPC (170) |
| `admin_report_top_products(int)` | `is_admin()` | admin dashboard RPC (170) |
| `approve_payout_statement(uuid)` | `is_admin()` + `auth.uid()` recorded | payout console (152) |
| `cancel_payout_statement(uuid)` | `is_admin()` | payout console (152) |
| `generate_payout_statement(...)` | `is_admin()` | payout console (152) |
| `mark_payout_statement_paid(...)` | `is_admin()` | payout console (152) |
| `current_user_role()` | reads own row by `auth.uid()` | RLS predicate |
| `has_role(text)` | reads own row by `auth.uid()` | RLS predicate |
| `is_admin()` | reads own row by `auth.uid()` | RLS predicate |
| `is_support()` | reads own row by `auth.uid()` | RLS predicate |
| `is_supplier_member(uuid)` | membership by `auth.uid()` | RLS predicate |
| `is_supplier_owner(uuid)` | membership by `auth.uid()` | RLS predicate |
| `is_supplier_order(uuid)` | membership by `auth.uid()` | RLS predicate |
| `is_supplier_shipping_order(uuid)` | membership by `auth.uid()` | RLS predicate |
| `redeem_voucher(...)` | `auth.uid()` + active `supplier_members` row, rate-limited (`check_user_rate_limit`), atomic single-use UPDATE | the supplier till (Expo app) |
| `supplier_app_context()` | `auth.uid()` | the supplier till; withdrawn from revoke list 143 because the app calls it |
| `verify_supplier_staff_pin(text)` | `auth.uid()`; **no rate limit inside the function** | staff PIN at the till. App-side limiter exists; a DB-level `check_user_rate_limit` call would close the direct-RPC brute-force path. Recommendation, not a blocker. |

**Fix for the one real finding** (one statement, to be written as a pending
migration, not applied by an agent):

```sql
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;
```

and add `SET search_path = pg_catalog, public` to the `set_updated_at`
redefinition block in `173_whatsapp_flow.sql`, `178_webauthn_credentials.sql`
and `179_push_subscriptions.sql` (or delete the block: the function exists in
production and `CREATE OR REPLACE` there only harms).

---

## 3. Performance advisors

| Lint | Level | Count | Note |
|---|---|---|---|
| `unused_index` | INFO | **174** | 45 of them are on `wp_import.*` (import staging, expected). The rest are on `public` tables with near-zero traffic (2 payments, 3 order_items, 0 vouchers, 0 settlement_events). "Never used" on a database with no production traffic is not a removal signal. Re-evaluate after 30 days of live traffic. |
| `unindexed_foreign_keys` | INFO | 1 | `coupon_qr_batches.created_by` (from 182, applied 09-07). One `CREATE INDEX IF NOT EXISTS coupon_qr_batches_created_by_idx ON public.coupon_qr_batches (created_by)` closes it. |
| `multiple_permissive_policies` | WARN (performance) | 15 | Same role + action covered by two permissive policies on `banners`, `homepage_sections`, `payment_events`, `payout_statement_lines`, `payout_statements`, `refunds`, `reviews` (5 roles), `supplier_branches` (4 actions). Correctness is unaffected; each extra policy is one more predicate per row. Consolidate with `OR` when these tables carry real volume. |
| `auth_db_connections_absolute` | INFO | 1 | Auth server pinned to 10 connections. `max_connections` = 60, 22 in use at audit time. Switch to percentage allocation before upsizing the instance. |

---

## 4. RLS coverage

```
public:     73 tables, 73 with RLS enabled, 0 with RLS and zero policies -> 100%
wp_import:  14 tables, 14 with RLS enabled                                -> 100%
policies:   148 on public (every public table has >= 1)
views:      12 (v_admin_pending_queues, v_cart_reaper_backlog, v_wallet_ledger,
            v_homepage_sections_live, v_banners_live, v_abandoned_cart_recovery,
            v_newsletter_stats, v_referral_review_queue, v_referral_stats,
            v_wallet_balance_drift, v_discount_campaign_performance, v_low_stock)
```

No table has `FORCE ROW LEVEL SECURITY`; the service role bypasses RLS by
design and the audited server writers depend on that.

Per-table policy counts (public), for the record:

| Policies | Tables |
|---|---|
| 5 | categories, popular_searches, product_variants, products |
| 4 | affiliates, audit_log, cashback_rules, coupon_deals, media_assets, order_items, orders, product_images, push_tokens, referrals, reviews, supplier_members, suppliers, user_addresses, vendors |
| 3 | payment_tokens, supplier_branches |
| 2 | banners, homepage_sections, payment_events, payout_statement_lines, payout_statements, profiles, refunds, subscriptions, supplier_leads, user_recent_searches |
| 1 | the remaining 39 (server-only deny or single admin/owner read) |

---

## 5. Function surface summary

| Kind | Count |
|---|---|
| SECURITY DEFINER functions in `public` | 74 |
| of which callable by `anon` | 2 (accepted, 2.1) |
| of which callable by `authenticated` | 20 (all self-gating, 2.2) |
| SECURITY INVOKER functions callable by `anon` | 4: `fts_join`, `fts_prefix_query`, `fts_unaccent`, `search_products` (all read through the caller's own RLS, by design of 171), plus trigger fn `fn_vouchers_status_guard` (harmless: returns `trigger`, not RPC-callable) |
| functions with unpinned `search_path` | 1 (`set_updated_at`, the regression above) |

---

## 6. Other live facts recorded during the audit

- `cron.job` holds **1 job**: `report_tables_nightly` (`30 1 * * *`), 5 successful runs. None of the 12 application crons of `scripts/cron-jobs.json` is scheduled at the database level (162 unapplied) and `vercel.json` declares no crons. `.github/workflows/cron.yml` exists as the interim scheduler.
- `vault.secrets` holds two names: **`CRON_SECRET` and `APP_BASE_URL`**. Migration 162 looks for `cron_secret` and `app_url` (lowercase, different second name) and will raise on its first guard. See `MIGRATION-REVIEW.md`.
- `pg_cron 1.6.4`, `pg_net 0.20.0`, `unaccent 1.1`, `supabase_vault 0.3.1` installed.
- Applied migration high-water mark: `20260907163213 coupon_qr_batches_182`.
- The ₪1 test row (`restaurants-meat-3`, `מוצר ראשי מאסטר Master Product`) is **still live**: `status = active`, `kenyon_price = 1.00`, `full_price = 400.00`, `stock_quantity = 10`, `platform_percent = 30`. Migration 172 (hide) is unapplied. The application-side guard (`implausible-discount.ts`, 95% threshold) blocks checkout; the row still renders in any listing that bypasses the cart.
- Data volume: 45 active products, 3 `order_items`, 2 `payments` (both `succeeded`, `cardcom_account_id` NULL, pre-registry), 2 `escrow_holds` (legacy, 2026-07-21), 0 vouchers, 0 settlement_events.
