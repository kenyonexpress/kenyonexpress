# C91 — F07 1 ILS card verification behind `card_verify_enabled`

The authorize-and-void flow already existed (C06): `POST /api/payments/verify-card` opens a LowProfile for `agorot(1)` through the payment adapter (`getPaymentProvider()`, sandbox or mock by env), `completeCardVerification` (`src/lib/payments/verify-card.ts`) checks amount and token, stores the token in `payment_tokens` and on `profiles.saved_payment_method`, then voids the charge with `refundByTransactionId({ cancelOnly: true })`. A failed void raises a Sentry payment alarm; the verification still succeeds.

C91 changes:

- **Flag `card_verify_enabled`**, default OFF. `src/lib/payments/card-verify-gate.ts` reads `feature_flags.bool_value` and fails closed (missing row, read error, throw = off). `FLAG_CARD_VERIFY_ENABLED=1` is the hard override. Replaces the old env kill switch `CARDCOM_1ILS_VERIFY`, which was on by default.
- POST returns 503 `verification_disabled` before auth when off. The GET/callback path is not gated, so a verification started while the flag was on can still finish.
- Migration `migrations/pending/313_card_verify_enabled_flag.sql` seeds the flag false. **Not applied** (Supabase MCP unauthed in this session). Until it is applied, and with no env override, the flow is off.
- Fixed `route.ts`, which redeclared `VERIFICATION_AMOUNT_AGOROT` without importing `agorot`; it now uses the constant from `verify-card.ts`.
- Money stays integer agorot; no PAN stored.

Tests (mocked Supabase and provider): `card-verify-gate.test.ts`, `verify-card.flow.test.ts` (token on profile, void called with `cancelOnly`, void failure alarm, decline, amount mismatch), `verify-card/route.gate.test.ts` (503 when off, 401 when on and anonymous).

Known unrelated failure: `src/__tests__/pending-migrations-inventory.test.ts` fails on a clean HEAD (README inventory out of date).

To enable: apply 313, then `update feature_flags set bool_value = true where key = 'card_verify_enabled'`.
