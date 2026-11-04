# C201: payment guard in code

## Change
- `src/lib/payments/payment-guard.ts`: new `isPaymentDisabled({ useMock, paymentProduction, vercelEnv })`.
  It returns true when `!paymentProduction && (!useMock || vercelEnv === 'production')`.
- `src/server/actions/payments/checkout.ts`: the `payment_disabled` return now uses that helper with
  `loadCardcomEnv().useMock`, flag `payment_production === true` and `process.env.VERCEL_ENV`. Mock can
  complete a checkout only on preview/dev.
- `src/lib/env.ts`: `CARDCOM_USE_MOCK` and `VERCEL_ENV` were added to the schema (now exported as `envSchema`).
  New check: `VERCEL_ENV === 'production' && CARDCOM_USE_MOCK === 'true'` fails with
  `CARDCOM_USE_MOCK must not be true in production`, the same shape as the CARDCOM_SANDBOX check.
  It runs before the NODE_ENV/ALLOW_INCOMPLETE_ENV early returns, so the local waiver cannot turn it off.
- `.env.example`: VERCEL_ENV documented (required by env-example-is-complete.test.ts).
- Tests: `src/lib/payments/payment-guard.test.ts`, `src/lib/env-mock-guard.test.ts`.

## Unit tests (vitest --reporter=verbose)
```
 ✓ src/lib/payments/payment-guard.test.ts > isPaymentDisabled > refuses the real provider while payment_production is off 2ms
 ✓ src/lib/payments/payment-guard.test.ts > isPaymentDisabled > refuses the mock on Vercel production while payment_production is off 0ms
 ✓ src/lib/payments/payment-guard.test.ts > isPaymentDisabled > lets the mock complete a checkout on preview and dev 0ms
 ✓ src/lib/payments/payment-guard.test.ts > isPaymentDisabled > never refuses once payment_production is on 0ms
 ✓ src/lib/env-mock-guard.test.ts > env: CARDCOM_USE_MOCK on Vercel production > refuses the mock provider when VERCEL_ENV is production 4ms
 ✓ src/lib/env-mock-guard.test.ts > env: CARDCOM_USE_MOCK on Vercel production > refuses it even with the local waiver set 0ms
 ✓ src/lib/env-mock-guard.test.ts > env: CARDCOM_USE_MOCK on Vercel production > allows the mock on preview and development 1ms
 ✓ src/lib/env-mock-guard.test.ts > env: CARDCOM_USE_MOCK on Vercel production > allows production when the mock is off 1ms
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

## tsc --noEmit
```
tsc exit 0
```

## pnpm lint (tail)
```
Checked 7125 files in 4s. No fixes applied.
Found 26 warnings.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
lint exit 0
```

## vitest run (full)
```
 Test Files  881 passed | 3 skipped (884)
      Tests  9731 passed | 39 skipped (9770)
vitest exit 0
```
