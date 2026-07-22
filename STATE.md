# KenyonExpress State

Date: 2026-07-23.

## Current Phase

**Checkout v1 implementation.** Branch `checkout/v1`, based on `phase6/complete-architecture`.
Architecture is frozen (5 design docs below); this phase turns it into code: migrations,
money/ledger/idempotency libraries, Cardcom adapter, checkout + webhook routes, typed order
state machine, and money/ledger invariant tests.

## Branches

| Branch | State |
|---|---|
| `phase5/homepage` | Product page committed `77fb030`. Visual compare diff still **26-55% in the y900-2100 band, NOT verified** against live. Homepage + cart + checkout foundation live here. |
| `infra/audit` | `INFRA-AUDIT.md` (infrastructure audit report). Security headers added (`fe45eb5`). |
| `phase6/complete-architecture` | 5 design docs committed (in `kenyon-complete` worktree): `COMPLETE-SYSTEM-ARCHITECTURE.md`, `CHECKOUT-COMPLETE.md`, `MIGRATIONS-040-050.md`, `INVARIANTS.md`, `DEPLOYMENT.md`. |
| `checkout/v1` | This branch. Checkout v1 build in progress (checked out in `kenyon-audit` worktree). |

**Missing doc:** `WP-DATA-MIGRATION.md` (WordPress data migration) is not yet written.

## Facts of record (2026-07-23)

- **41 numeric money columns** still need conversion to integer **agorot** (migration `051`,
  logical plan step 040). No floats anywhere in the money path; every rate is integer basis points.
- **Live baseline (measured):** LCP **9.2s mobile**, CLS **0**, Performance **68**, SEO **92**.
- **26 public tables**, **RLS enabled on all**, **3 server-only by design** (money/accounting
  tables with zero client write policies: `ledger_*`, `idempotency_keys`, etc.; enforced by
  immutability triggers that bind even service_role).

## Business rules (unchanged, binding)

- **Coupon:** customer pays a **partial amount on site** (`platform_percent` of face); the
  **rest is collected at the merchant** when scanned. **NO escrow.** Platform keeps the on-site
  fee; supplier receives 0 from the platform for coupon lines. Expired unused coupon = breakage.
- **Physical:** customer pays the **full charge on site**. Per-product **`platform_percent` is
  snapshotted into `order_items`** at purchase and frozen after `paid_at`; settlement never
  re-reads live product rates. Supplier settles after `delivered + 14d`.
- **Supplier details appear on every product page** (coupon and physical alike).
- **Wallet is internal cashback only** - spendable on site, never withdrawable.

## In Progress

Checkout v1 modules (see Next Tasks). `src/lib/money.ts` + `src/lib/money.test.ts` started.

## Blocking Issues

- Migration `051` (numeric -> agorot) requires the server-action **code cutover merged first**
  (reads `*_agorot`/`*_bp`); applying it before cutover breaks the 027 settlement functions.
- Product-page visual diff (26-55% in y900-2100) unverified against live.
- Gap **G1**: `payment_webhook_events` lacks an append-only block trigger (P1).

## Next Tasks (in order)

1. Apply migrations 040-050 (files 042, 050-056) to Supabase; verify each with a SELECT; roll back on failure.
2. `src/lib/money.ts` - agorot branded integer type; parse/format/round; basis-point percent math; zero floats; vitest.
3. `src/lib/idempotency.ts` - key generation; server dedupe against `idempotency_keys`; response replay.
4. `src/lib/cardcom/` - `createLowProfile`, `verifyWebhookSignature`, `chargeToken`, `refund`; zod-validated; no secrets in client bundle.
5. `app/api/checkout/create/route.ts` - validate cart; coupon partial vs physical full; snapshot `platform_percent` into `order_items`; create pending order; return Cardcom redirect URL.
6. `app/api/webhooks/cardcom/route.ts` - signature verify; replay guard via `payment_webhook_events`; order transition; ledger posting; coupon issuance; idempotent under duplicate delivery.
7. `src/lib/ledger.ts` - `postJournal` with sum-zero assertion; account resolution; reversal entries.
8. Order state machine as typed transitions; illegal transitions throw.
9. vitest for money + ledger invariants; integration test for webhook replay.

Rules for this phase: integer agorot everywhere, no floats; every money mutation through the
ledger; commit per module with `pnpm build` passing; no UI components.

## Working Directory

`/Users/ofir/kenyonexpress-web/kenyon-audit` (branch `checkout/v1`).
Design docs in `/Users/ofir/kenyonexpress-web/kenyon-complete` (branch `phase6/complete-architecture`).
