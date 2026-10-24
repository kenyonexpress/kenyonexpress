# L4 / C05 — Cart + Checkout + Confirm, guest flow

Date: 2026-10-25. Branch: security-headers-c75.

## Flow as implemented (no code changed this item)
- Add to cart: `/api/cart`, `/cart` (CTA "המשך לתשלום" goes straight to `/checkout` for a guest).
- `/checkout`: open to guests, shipping address only (no billing), empty cart redirects to `/cart`.
- Pay press hits Cardcom (mock when `CARDCOM_USE_MOCK=true`; `src/lib/payments/mock-cardcom.ts`).
- Confirm: `/checkout/return` (paid) shows `SaveWithGoogle`, the only place Google Sign-In is asked, after payment.

## Cardcom
`.env.local` holds test placeholders and `CARDCOM_USE_MOCK=true`. Mock only, no production calls.

## Verified
- `vitest run "src/app/(store)/checkout"`: 6 files, 36 tests pass.
- `vitest run cardcom checkout`: 24 files, 278 tests pass (mock gateway, form contract, SaveWithGoogle, saved-address gates).

## Not verified (blocker)
- Browser run of `e2e/checkout.spec.ts` + `e2e/cart.spec.ts` did not finish. The catalogue read fails on the
  database: `column suppliers_1.verification_status does not exist`. The fix is
  `migrations/pending/301_supplier_verification_status.sql`, which is not applied. Applying it needs the Supabase MCP
  on project ixvwfbuvfxxsjiywhbbb, and that connector is unauthenticated in this non-interactive session.
  With no catalogue there is no product to add to the cart, so the guest flow cannot be driven end to end.
- compare.mjs gate was not re-run (no UI change in this item).

## Next
Apply 301 via Supabase MCP, then `pnpm exec playwright test e2e/checkout.spec.ts e2e/cart.spec.ts`.

RESULT: BLOCKED supabase MCP unauthenticated, migration 301 unapplied, catalogue reads fail so e2e guest flow unverifiable
