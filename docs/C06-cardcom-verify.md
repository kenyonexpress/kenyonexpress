# C06 — F07 Cardcom 1 ILS card verification

Already shipped in `src/app/api/payments/verify-card/route.ts`; C06 adds the flag only.

- POST: creates `payment_card_verifications` row, opens a Cardcom LowProfile for `agorot(1)` with `saveToken: true`.
- Callback (GET `?v=<id>`): `verifyLowProfile`, checks amount == 1 agora-integer and token present, stores token in `payment_tokens` + `profiles.saved_payment_method`, then auto-refunds via `refundByTransactionId` (`cancelOnly`), recording `voided`. Refund failure raises a Sentry payment alarm but verification still succeeds.
- Money is integer agorot via `@/lib/commerce/money`.
- Flag `CARDCOM_1ILS_VERIFY`: kill switch. Unset = on (flow already live in checkout/supplier apply); `0`/`false` = POST returns 503 `verification_disabled`.
