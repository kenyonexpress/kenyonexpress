# G104 — CART-CHECKOUT (/cart, /checkout, Electro layout)

Result: BLOCKED (parity gate cannot be measured: no seeded cart; payment flag shipped).

## Already in place (verified 2026-10-30)
- `/cart` (`CartPageView`) and `/checkout` (`CheckoutForm`, 3-step) exist, RTL, in the Electro layout.
- Guest flow: `ensureCheckoutUser` gives an anonymous session on submit, guest cart merged by `mergeGuestCart`.
- Google sign-in at the end: `checkout/return/SaveWithGoogle.tsx` on the thank-you page.
- Address only for physical: `validateCartView().requiresAddress` drives `needsAddress`; shipping only, no billing.
- Invoice download on confirm: `checkout/return/page.tsx` links `/account/orders/<id>/invoice` (route.ts exists).
- Money: integer agorot via `src/lib/commerce/money`.

## Changed in G104
- New flag `payment_production` (default OFF): `src/lib/flags/index.ts` (env `FLAG_PAYMENT_PRODUCTION`),
  `src/lib/flags/supabase-flags.ts` (DB key `payment_production`, env fallback).
- `runSubmitCheckout` (`src/server/actions/payments/checkout.ts`) returns code `payment_disabled` and creates no order or
  charge while the flag is off. The mock terminal (`CARDCOM_USE_MOCK`) moves no money and is exempt, so tests and previews run.
- `migrations/pending/312_payment_production_flag.sql` seeds the row as false. NOT applied: Supabase MCP is
  unauthenticated in this session. Until it is applied the env fallback applies, which is also OFF.
- Flag tests updated (6 flags, new key in exact-match assertions) plus a `payment_production` test.

## Checks
- `tsc --noEmit` clean; vitest flags + checkout + server: 85 files / 1075 tests pass.
- `pnpm build` ok.

## Gate (compare.mjs <11% at 380/768/1440 on cart and checkout) — NOT MEASURED
- cart: refuses ("live cart is filled and the local cart is empty").
- checkout: refuses ("cart did not stick").
- Cause: the catalogue is unreadable (migration 306 unapplied, see C04), so no product can be added to a cart locally.
  `COMPARE_CART_EMPTY=1` would compare an empty cart against a filled reference, which is not a valid pass.
- refs/GAP-CART-CHECKOUT.md lists 303 cart gaps; none closed here.

## Unblock
Apply 306 and 312 via Supabase MCP, rerun `node scripts/compare.mjs --page=cart|checkout` at 380/768/1440, then close the gaps.

No forbidden files touched.

RESULT: BLOCKED parity gate unmeasurable (no seeded cart, catalogue empty)
