# C98 — CART + CHECKOUT final sweep

RESULT: BLOCKED sandbox smoke needs seeded catalogue (migration 306 unapplied, Supabase MCP OAuth unavailable)

## Verified in code (2026-10-30)
- Guest checkout: anonymous session on submit (`ensureCheckoutUser`), guest cart merged (`mergeGuestCart`).
- Google sign-in at end of order: `src/app/(store)/checkout/return/SaveWithGoogle.tsx` on the thank-you page.
- Address only for physical products, shipping only, no billing: `requiresAddress` drives `needsAddress` in `CheckoutForm.tsx`.
- Address auto-saved after the first physical order (and when re-entered): `src/server/actions/payments/checkout.ts` ~L1091, table `user_addresses`.
- Card tokenized on first purchase; repeat purchases charge the saved token server-to-server: `chargeSavedToken` (same file), expiry via `src/lib/payments/token-expiry.ts`.
- Money: integer agorot only.

## Checks
- vitest checkout + payments: 20 files / 227 tests pass.
- Payment gate `payment_production` stays OFF (G104); mock terminal `CARDCOM_USE_MOCK=true` moves no money.

## Not done: sandbox payment smoke test
- Re-probed REST with the service key: `suppliers.open_weekends` still 42703 (migration 306 not applied), so the catalogue read fails and no product can be added to a cart.
- Supabase MCP (project ixvwfbuvfxxsjiywhbbb) requires OAuth, unavailable in this non-interactive session; `db push` is forbidden.
- A smoke test that cannot start is not green, so no DONE.

## Unblock
Apply 306 and 312 via Supabase MCP `apply_migration`, then run `e2e/purchase-flow.spec.ts` and `e2e/physical-purchase.spec.ts` against the mock terminal.

No forbidden files touched.
