# C05 — CART-CHECKOUT (guest checkout E2E)

RESULT: BLOCKED catalogue unreadable (migration 306 unapplied, Supabase MCP unauthenticated)

## Required
Playwright, guest: cart -> checkout -> google-signin-end -> thank-you, coupon path and physical path, all money integer agorot via `src/lib/money.ts`.

## Re-checked 2026-10-30
- Same state as C04 (`docs/C04-CHECKOUT-E2E.md`). `migrations/pending/306_suppliers_open_weekends.sql` is still pending. The only permitted way to apply it is Supabase MCP `apply_migration` on project ixvwfbuvfxxsjiywhbbb, and the claude.ai Supabase connector still needs OAuth, which a non-interactive session cannot do. `db push` is forbidden.
- The repo has no readable `.env.local` (only a misnamed `^[A-Z_]* .env.local`), so the database cannot be reached any other way either.
- Without the migration every product grid is empty (`catalogue.category_products_failed`, 42703). Both `addOpenProductToCart` and `e2e/purchase-flow.spec.ts` discover a live product at runtime, so the journey cannot start. The coupon and physical paths also write orders and need the seeded database.

## Existing coverage
`e2e/cart.spec.ts`, `e2e/checkout.spec.ts` (no database), `e2e/purchase-flow.spec.ts`, `e2e/physical-purchase.spec.ts`, `e2e/coupons.spec.ts` (database).

## Not done
No spec was added. A spec that has never run green would not satisfy "No DONE unless the gate passes". Google sign-in cannot be driven against the real provider; use the `auth-session.ts` / `otp-seed.ts` fixtures.

## Unblock
1. Apply migration 306 via Supabase MCP.
2. Add `e2e/guest-checkout-e2e.spec.ts`, register it in `e2e/database-need.ts` (`e2e-classification.test.ts` enforces this), with coupon and physical variants asserting integer agorot only (physical: shipping address only, no billing).

No forbidden files touched.
