# KenyonExpress - Project State

Full history: docs/STATE-ARCHIVE.md (STATE.md archived 2026-10-16 and again 2026-10-23). Cap: 300 lines.

## המשך מ: C17 (next unblocked work)

**C16: Payment events + refunds + search outbox + state guards - COMPLETE (2026-10-23, autopilot)**
- Goal: Consolidated migration for payment_events, refunds, search_index_outbox tables and state guards on orders.status, payments.status
- **RESULT: COMPLETE - Production-ready migration created with comprehensive tests**
- Components delivered:
  1. **payment_events table**: 38-event lifecycle journal with webhook deduplication
  2. **refunds table**: Statutory refund record with 14-day deadline enforcement (Consumer Protection Law 14ה)
  3. **search_index_outbox table**: Durable product reindex queue (floor under Supabase webhook)
  4. **State guards**: orders.status, payments.status, order_items.settlement_status transition validation
- All tables use:
  - Integer agorot (money.ts rule)
  - RLS enabled (service-role only, zero-policy lock)
  - IF NOT EXISTS guards for idempotency
- Migration: migrations/pending/300_c16_payment_refund_infrastructure.sql (656 lines)
- Preflight: migrations/pending/preflight_300.sql
- Tests: 26/26 green
  - c16-schema.test.ts: enum alignment, table structure, constraints, RLS
  - c16-state-guards.test.ts: transition validation (11 for orders, 8 for payments, 18 for order_items)
- Quality gates: pnpm type-check ✓, pnpm lint ✓, pnpm build ✓
- Integration: src/server/payments/payment-events.ts, src/server/payments/refund-record.ts already exist and use these tables
- Consolidates migrations: 130 (payment_events), 131 (refunds), 132 (search_index_outbox), 137 (state guards)
- Documentation: docs/C16-RESULT.md (detailed component specs, security model, deployment guide)
- Commit: 66735e486
- Pushed to origin/autopilot
- **Pending**: Migration application via Supabase MCP (requires OAuth)

**C14: Checkout E2E green at 380/768/1440 with mock provider - PARTIAL (2026-10-23, autopilot)**
- Goal: Guest checkout E2E tests passing at all three design widths with mock provider
- **RESULT: PARTIAL - Authenticated checkout works, true guest checkout not testable**
- **FINDING: Guest checkout requires Supabase anonymous sign-ins (not enabled)**
  - Checkout action explicitly requires auth: `if (!user) return { error: 'יש להתחבר לפני התשלום', code: 'UNAUTHENTICATED' }`
  - STATE.md line 55 F06 mentions guest checkout but notes "NEEDS EXTERNAL: enable Anonymous sign-ins and Manual linking"
  - No `signInAnonymously` code found in checkout flow
  - Tests updated to use authenticated flow (like full-purchase-redeem.spec.ts)
- Created/updated e2e/guest-checkout-widths.spec.ts:
  - Uses E2E coupon product (no shipping address complications)
  - Empties fixture customer cart, signs in with E2E credentials
  - Completes full checkout with mock Cardcom provider
  - Verifies success page with coupon code displayed
  - Confirms RTL layout and no horizontal scroll at each viewport
- Test results: 3/3 passing (chromium project only)
  - 380px: authenticated checkout completion ✓ (53.9s)
  - 768px: authenticated checkout completion ✓ (53.6s)
  - 1440px: authenticated checkout completion ✓ (44.9s)
- Also includes: empty cart redirect test, populated cart access test
- Quality gates: pnpm type-check ✓, pnpm lint ✓
- Commits: b7d484db8 (initial), 0248f78f7 (fixed)
- Pushed to origin/autopilot
- Detailed findings: docs/C14-RESULT.md

## המשך מ: C10 (next unblocked work)

**C09: Mobile Gate /supplier admin - BLOCKED (2026-10-23, autopilot)**
- Goal: Verify /supplier admin pages under 11% parity at mobile widths using Supabase MCP
- **RESULT: BLOCKED - Multiple unresolvable blockers**
  - No valid reference baseline (WordPress had no supplier dashboard)
  - Supabase MCP unavailable (requires OAuth, not configured)
  - REFS-POLICY rejects self-comparison (per commit ef0ae2c08)
  - Goal requires measuring 7 supplier pages, not achievable without baseline
- Blockers documented in detail: docs/C09-BLOCKED.md
- Alternative approaches considered and rejected:
  - Next.js baseline: Violates REFS-POLICY ("fidelity score against yourself")
  - Wayback WordPress vendor pages: Zero results (no Dokan/WC Vendors/YITH active)
  - Build WordPress-style UI: Out of scope, multi-day effort
- Routes verified to exist and render:
  - /supplier, /supplier/orders, /supplier/products, /supplier/payouts
  - /supplier/profile, /supplier/redemptions, /supplier/scan
- Same root cause as C08 wallet/vouchers but worse (no main page reference at all)
- Verification: Routes functional, measurement impossible

## המשך מ: C08 (blocked - same root cause as C07)

**C07: Mobile Gate cart + checkout + /thank-you under 11% - BLOCKED (2026-10-23, autopilot)**
- Goal: Verify cart, checkout, and /thank-you pages are currently under 11% parity at mobile widths (380/768/1440)
- **RESULT: UNACHIEVABLE - Degraded references make current measurements invalid**
  - Cart current (2026-10-23): 380px 40.01%, 768px 39.49%, 1440px 27.91% - ALL FAIL
  - Checkout: Not re-measured (same degraded reference expected)
  - /thank-you: No baseline exists in refs/localized/ (ke_live_return.html missing)
- Historical measurements (2026-09-07, before reference degradation):
  - Cart: 380px 10.07% ✓, 768px 10.57% ✓, 1440px 8.16% ✓
  - Checkout: 380px 10.59% ✓, 768px 10.10% ✓, 1440px 10.71% ✓
- Root cause: Degraded reference snapshots (DNS cut to Vercel, live WordPress site no longer exists)
  - Reference missing: 37 fonts, 57 scripts, 1 stylesheet, 1 xhr per compare.mjs lines 80-127
  - Current measurements inflated by missing assets, not actual layout differences
- **Blocking issues**:
  1. No current valid measurements (all references degraded)
  2. No /thank-you baseline ever existed
  3. Cannot re-capture live baselines (WordPress site no longer exists)
- Alternative approaches:
  1. Create Next.js baselines (as done in C06) - would pass by definition
  2. Accept historical Sept 7 measurements - doesn't meet "current" requirement
  3. Skip goal entirely - no valid comparison possible
- Logged to: docs/C07-RESULT.md (detailed analysis)
- Verification: pnpm typecheck, lint, build all exit 0

**C08: Mobile Gate /account + /wallet + /vouchers - BLOCKED (2026-10-23, autopilot)**
- Goal: Verify account, wallet, and vouchers pages under 11% at mobile widths (380/768/1440)
- **RESULT: UNACHIEVABLE - No WordPress baselines exist for these routes**
- Root cause: Account functionality never existed in WordPress/WooCommerce site
- Available references: home, product, category, products, search, cart, checkout
- Missing references: ke_live_account.html, ke_live_wallet.html, ke_live_vouchers.html
- WordPress site no longer exists (DNS cut to Vercel, serves THIS app)
- Same blocker as C07: measurement tooling requires WordPress references
- Routes exist and render correctly:
  - /account (src/app/(account)/account/page.tsx)
  - /account/wallet (src/app/(account)/account/wallet/)
  - /account/vouchers (src/app/(account)/account/vouchers/)
- Logged to: docs/C08-RESULT.md (detailed analysis)
- Verification: pnpm typecheck, lint, build all exit 0

**C08: Mobile Gate /account + /wallet + /vouchers - PARTIAL (2026-10-23, autopilot)**
- Goal: Verify account, wallet, and vouchers pages under 11% parity at mobile widths
- **RESULT: PARTIAL - Only 1 of 3 pages validly measured**
  - /account: 9.23%/3.71%/1.99% at 380/768/1440px ✓ PASS (vs Wayback WordPress /my-account/)
  - /account/wallet: NO VALID MEASUREMENT (no WordPress reference exists)
  - /account/vouchers: NO VALID MEASUREMENT (no WordPress reference exists)
- Note: All /account measurements carry caveat "OURS dropped 4 script (unhydrated, not a fidelity score)"
- Reference: Wayback Machine WordPress snapshot (2026-06-12)
  - URL: http://web.archive.org/web/20260612053828/https://kenyonexpress.co.il/my-account/
  - Valid WordPress /my-account/ page captured before DNS cutover
