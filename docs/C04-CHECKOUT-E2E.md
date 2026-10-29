# C04 — CART-CHECKOUT-CONFIRM (guest checkout E2E)

RESULT: BLOCKED catalogue unreadable (migration 306 unapplied, Supabase MCP unauthenticated)

## Required
Playwright, guest: add-to-cart -> cart -> checkout -> google-signin-end -> thank-you, coupon path and physical path, all money integer agorot via `src/lib/money.ts`.

## Measured 2026-10-29
- PostgREST `suppliers?select=open_weekends` with the service-role key returns `42703 column suppliers.open_weekends does not exist`.
- `migrations/pending/306_suppliers_open_weekends.sql` is still unapplied. The only way to apply it is the Supabase MCP `apply_migration` on project ixvwfbuvfxxsjiywhbbb, and it is unauthenticated in this non-interactive session. `db push` is forbidden.
- Result: `catalogue.category_products_failed`, so every product grid is empty (same cause as C03, M03-c264/c266/c268). The journey cannot start, because `addOpenProductToCart` and the existing `purchase-flow.spec.ts` both discover a live product at runtime.
- The coupon and physical paths also write orders against the mock terminal, so they need the same seeded database (`NEEDS_DATABASE_SPECS`).

## Existing coverage
`e2e/cart.spec.ts`, `e2e/checkout.spec.ts` (no database), `e2e/purchase-flow.spec.ts` and `e2e/physical-purchase.spec.ts` (database).

## Not done
No spec was added. A spec that has never run green would not satisfy "No DONE unless the gate passes". Google sign-in also cannot be driven against the real provider; it needs the existing `auth-session.ts` / `otp-seed.ts` fixtures.

## Unblock
1. Apply migration 306 via Supabase MCP.
2. Rerun C04. Add `e2e/guest-checkout-e2e.spec.ts` and register it in `e2e/database-need.ts` (`e2e-classification.test.ts` enforces this), with coupon and physical variants asserting integer agorot only.

No forbidden files touched.
