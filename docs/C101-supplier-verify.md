# C101 - supplier 1 ILS card verification

Status: **BLOCKED (sandbox credentials)**. Code and gate are done; the sandbox smoke test could not be run.

## What already existed (rc5 F07, migration 281)
- `POST /api/supplier/apply` -> `submitSupplierLead` -> `startSupplierCardVerification` (`src/server/supplier/card-verification.ts`): writes `supplier_card_verifications`, creates a Cardcom LowProfile for 100 agorot with `saveToken`, redirects to the hosted page (card data never touches this server).
- `GET /api/supplier-apply/card-verify` (redirect + indicator): `completeSupplierCardVerification` asks Cardcom (`verifyLowProfile`), checks the exact 100 agorot, stores the token in `supplier_card_tokens` (the table is named that, not `supplier_cards`; no rename, it is applied), voids the shekel (`refundByTransactionId`, `cancelOnly`), then creates the lead. Idempotent via `started -> processing`.
- The UI step is the existing Cardcom redirect from the apply form on `/suppliers` (there is no `/supplier/apply` page route; the API lives at `/api/supplier/apply`).

## Added in C101
- `liveChargeAllowed()` gate: a non-sandbox Cardcom terminal charges only when `PAYMENTS_PROD_ENABLED=true`. Otherwise the attempt is marked `unavailable` and the team gets the application by mail, same as an unconfigured terminal. Mock and sandbox (terminal `1000` or `CARDCOM_SANDBOX=true`) are never gated.
- `.env.example` documents `PAYMENTS_PROD_ENABLED`.
- Tests: `src/server/supplier/card-verification.test.ts` (gate cases plus the existing complete-flow cases). `tsc --noEmit` clean.

## Sandbox smoke test: not run
`.env.local` holds placeholder Cardcom values with `CARDCOM_USE_MOCK=true` (same as docs/C10-CARD.md). The flow also needs a person to type a test card on Cardcom's hosted page. To run it: set sandbox terminal credentials and `CARDCOM_USE_MOCK=false`, apply on `/suppliers`, complete the hosted page with a Cardcom test card, then confirm `supplier_card_verifications.status='verified'`, a `supplier_card_tokens` row, and `voided=true`.
