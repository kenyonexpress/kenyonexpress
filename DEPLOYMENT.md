# DEPLOYMENT

kenyonexpress.co.il. Branch `phase6/complete-architecture`. **Design + ops runbook. No UI files.**

Production is **Vercel** (Next.js) + **Supabase** (Postgres/Auth/Storage) + **Cardcom** (PSP). This is the ship checklist and the recovery runbook for a money-handling system: secrets, RLS everywhere, indexes, monitoring, backup, recovery.

---

## 1. Secrets

All secrets live in **Vercel server-side env** (and Supabase project settings) — never in the client bundle, never committed.

| Var | Where used | Exposure rule |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | public (by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | public; RLS is the real guard |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (`admin.ts`, webhook, cron, finalize) | **never** in `"use client"` or any browser bundle |
| `SUPABASE_DB_URL` | scripts / drizzle-kit / migrations only | server/CI only |
| `NEXT_PUBLIC_APP_URL` | redirect + webhook URL construction | public |
| `CARDCOM_TERMINAL`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_USERNAME` | Cardcom adapter (server) | server only |
| `CARDCOM_WEBHOOK_SECRET` | webhook HMAC verify | server only; support dual-secret rotation window |
| `CRON_SECRET` | authenticates Vercel Cron → route | server only |
| `REVALIDATE_SECRET` (`x-revalidate-secret`) | Supabase DB webhook → `/api/revalidate` | server only |
| `CHECKOUT_ENABLED` | kill switch | server env, default true |

**CI enforcement (blocking):**
- Grep gate: `SUPABASE_SERVICE_ROLE_KEY` / `CARDCOM_*` / `*_SECRET` must not appear in any client component or the built client chunks. An import fence forbids importing `admin.ts` from client code.
- Secret scanning on push; rotate on any leak. `.env.local` is git-ignored and must stay empty in the repo.
- Cardcom secrets are **Phase-2** (commented in `.env.example`); enabling checkout in production requires all four Cardcom vars + `CARDCOM_WEBHOOK_SECRET` present, or `CHECKOUT_ENABLED` stays false.

---

## 2. RLS everywhere (the deploy gate that matters most)

**Rule: every table in `public` has RLS enabled.** A table with RLS off is a release blocker.

| Table class | Policy shape |
|---|---|
| User-owned (`orders`, `order_items`, `wallet_balances`, `coupon_codes`, `payment_tokens`, `user_addresses`) | owner read via `user_id = auth.uid()` / `profile_id = auth.uid()`; admin ALL; support SELECT |
| Supplier (`settlement_*` reads, `order_items` supplier read, `supplier_members`) | `is_supplier_member(supplier_id)` / role checks |
| Money / accounting (`ledger_*`, `payments`, `payment_webhook_events`, `commission_ledger`, `settlement_*`, `reconciliation_*`, `idempotency_keys`) | **RLS enabled, zero client write policies.** service_role / SECURITY DEFINER only. `idempotency_keys` has no policies at all (default deny). |
| Catalog (`products`, `categories`) | public read `status='active' AND deleted_at IS NULL`; content_uploader/admin write |

**Two-layer enforcement for accounting tables:** RLS is the second line. The first is immutability triggers (050) and function-only writes that bind **even service_role** — because service_role bypasses RLS. Both must be present.

**Pre-deploy RLS smoke tests (blocking):**
1. Anon client cannot `SELECT` any row from `ledger_journal_lines`, `payments`, `settlement_items`, `reconciliation_discrepancies`.
2. A non-owner authenticated user cannot read another user's `orders` / wallet lines.
3. An authenticated (non-service) role cannot `INSERT`/`UPDATE` any money table.
4. `supabase get_advisors` (security) returns no RLS-disabled or policy-gap findings on `public`.

---

## 3. Indexes (hot-path plan)

Confirm present before shipping checkout (from MASTER §5.4 / `MIGRATIONS-040-050.md §3.9`):

- `orders (user_id, created_at DESC)` partial `deleted_at IS NULL`; `orders (expires_at)` partial `status='pending' AND paid_at IS NULL`.
- `order_items (order_id)`, `(supplier_id, item_status)`.
- `payments (idempotency_key)` UNIQUE, `(cardcom_transaction_id)` UNIQUE, `(cardcom_low_profile_id)`.
- `coupon_codes (code)` UNIQUE, `(supplier_id, status, expires_at)`, partial `(expires_at) WHERE status='issued'`.
- `coupon_redemptions (coupon_code_id)` UNIQUE.
- `wallet_entries (idempotency_key)` UNIQUE.
- `ledger_journals (event_key)` UNIQUE; `ledger_journal_lines (journal_id)`, `(account_id)`.
- `settlement_items (order_item_id)` UNIQUE, `(batch_id)`; `settlement_batches (supplier_id, period_start, period_end)` UNIQUE.
- `payment_webhook_events (provider, external_event_id)` UNIQUE.
- `products (slug)` partial-unique active, `(supplier_id)`, GIN `search_vector`.

Gate: `supabase get_advisors` (performance) shows no missing-index warning on foreign keys of hot tables. Track G2 (verify `order_items (supplier_id, item_status)` + products GIN) before catalog scale-up.

---

## 4. Migration apply pipeline

- **Files only in git; apply only via approved `apply_migration` MCP path. Never `db push`.**
- Apply order **050 → 056**, each preceded by its `INVARIANTS.md` check on staging (see `MIGRATIONS-040-050.md §4`).
- **051 (money → agorot) requires the server-action code cutover merged first** (reads `*_agorot`/`*_bp`). This is the single highest-risk step; 051 self-aborts on any backfill drift.
- After each apply: run the mapped INVARIANTS queries; a non-empty result blocks promotion.
- Keep `src/types/database.ts` in sync (`pnpm db:types`) and re-sync Drizzle schema after 051.

---

## 5. Monitoring + alarms

| Signal | Source | Severity | Action |
|---|---|---|---|
| Wallet ledger drift (INV-2) | nightly recon job | **SEV1** | page on-call; freeze wallet spend if widespread |
| Ledger not sum-zero (INV-1) | recon + `trg_ledger_lines_balanced` | **SEV1** | investigate before any settlement |
| Supplier payable drift (INV-8) | nightly recon | SEV1 | block affected supplier batch |
| Stuck `redirected` payments ≥ 5 | reconcile cron (10 min) | SEV2 | check Cardcom + webhook route health |
| Amount mismatch on webhook | webhook handler → `v_money_alarms` | SEV1 | no finalize; manual review |
| Signature-invalid flood | `security_events` | SEV2 | check for rotation gap / attack |
| Unmatched Cardcom deposits | `reconcile_cardcom_settlement` | SEV3 | match before `mark_settlement_batch_paid` |
| Overdue pending orders not cancelled | expiry cron | SEV3 | check cron auth / `CRON_SECRET` |
| Notifications dead-letter | outbox worker | SEV3 | drain queue |

- **Cron health:** every Vercel Cron route authenticates with `CRON_SECRET` and records last-run; a missed run is itself an alert.
- **Money alarms view** `v_money_alarms` aggregates the SEV1/SEV2 conditions for a single admin dashboard read.
- **Supabase advisors** (security + performance) run in CI and weekly.

---

## 6. Backup

Supabase free/low tiers do **not** guarantee point-in-time recovery, so backup is our responsibility (R14):

- **Daily `pg_dump`** via GitHub Actions (`SUPABASE_DB_URL` secret) → encrypted artifact / object storage, 30-day retention, 12 monthly retained.
- **Financial tables are the priority set** (`orders`, `order_items`, `payments`, `payment_webhook_events`, `ledger_*`, `settlement_*`, `wallet_*`, `coupon_*`): included in every dump; verified row counts logged.
- **Migrations are the schema backup** — the ordered `supabase/migrations/*` files reproduce the schema deterministically.
- **Payment evidence retention:** `payment_attempts` + `payment_webhook_events` retained per financial record rules (target 7 years; 13 months hot then cold archive).
- **DR drill monthly:** restore the latest dump into a scratch project, apply migrations, run all INVARIANTS — a green run is the restore's acceptance test.

---

## 7. Recovery runbook

| Incident | Immediate action | Recovery |
|---|---|---|
| Webhook route down / failing | Cardcom keeps retrying; reconcile cron polls `GetLpResult` for `redirected` > 10 min and finalizes | fix route; no data lost (persist-first + idempotent finalize) |
| Finalize failed after card capture | alarm; customer sees "processing" | auto Cardcom refund of the capture + admin page; never a silent charge |
| Double-charge suspected | INV-6 flags duplicate `cardcom_transaction_id` / >1 succeeded charge | refund the duplicate; `cardcom_transaction_id` UNIQUE prevents recurrence |
| Ledger imbalance detected | INV-1 SEV1; block settlements | correct only via reversal journal; never edit lines |
| Wallet drift | INV-2 SEV1; freeze spend | re-derive `wallet_balances` from ledger sum; investigate the writer that bypassed `fn_wallet_transfer` |
| Bad migration applied | halt promotion | roll back per that migration's rollback note (`MIGRATIONS-040-050.md §3`); restore from dump if data touched |
| Secret leaked | rotate immediately | rotate in Vercel + Supabase + Cardcom; dual-secret window for `CARDCOM_WEBHOOK_SECRET`; audit access |
| Data-loss event | stop writes | restore latest verified `pg_dump` → apply migrations → run INVARIANTS → reconcile Cardcom deposits before resuming payouts |

**Kill switch:** set `CHECKOUT_ENABLED=false` to stop new charges while already-charged payments still finalize. This is the first lever in any payment incident.

---

## 8. Release gate (all must pass before a production deploy touching money)

1. `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` green.
2. Secret grep + import-fence gate green (§1).
3. RLS smoke tests + `get_advisors` (security) clean (§2).
4. Every `INVARIANTS.md` query returns zero rows on staging (§4).
5. Checkout sandbox matrix (`CHECKOUT-COMPLETE §8`) green against the fake adapter; nightly sandbox run green.
6. Migrations applied in order with per-step INVARIANTS; `database.ts` + Drizzle re-synced.
7. Latest `pg_dump` verified and DR drill within the last month.
8. Cardcom secrets present (or `CHECKOUT_ENABLED=false`).

A failure at any gate blocks the deploy; overriding requires a documented super_admin decision.

End of DEPLOYMENT.
