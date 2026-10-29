# C10 — Cardcom 1 ILS auth-only verify

Status: BLOCKED cardcom-prod-creds-pending (2026-10-30)

## Findings
- `.env.local` Cardcom values are placeholders (terminal `1234…`, api name/password `test…`) with `CARDCOM_USE_MOCK=true`. No real sandbox or production terminal credentials are present.
- A live signup of 1 ILS (100 agorot) auth-only, immediate refund and token capture cannot be exercised against the real Cardcom API without them.
- The Supabase MCP is unauthenticated in this session, so saving a `card_token` to `profiles.payment_tokens` could not be verified either.
- Mock path (`src/lib/payments/mock-cardcom.ts`) and its tests already exist; they do not count as live verification.

## To run once creds land
1. Set `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_USE_MOCK=false`.
2. Create low-profile for 100 agorot (via `src/lib/money.ts`), operation = create-token / auth-only.
3. Refund the transaction immediately; confirm zero net charge.
4. Store `card_token` (token + expiry only, never PAN) in `profiles.payment_tokens`.

RESULT: BLOCKED cardcom-prod-creds-pending
