# W11 Hardening

Code-agent spec. Security already has: webhook `?s=` constant-time, no HMAC from Cardcom, GetLpResult re-fetch, compromised key SHA-256 denylist, `CHECKOUT_ENABLED`, cron Bearer, frame-return ungated on purpose.

---

## What it builds

1. Rotate leaked `SUPABASE_SECRET_KEY` (human, launch blocker). `scripts/compromised-keys.mjs` + deploy-preflight refuse the old hash.
2. Confirm no `NEXT_PUBLIC_` secret pattern at boot.
3. Admin actions all `requireSection` + audit. Uploader prohibitions complete.
4. Guest cart still constructed cookie, not jar forward.
5. `apps/mobile` still has no service_role.

---

## Tables

`audit_log`, `rate_limits`, `payment_webhook_events` (zero-policy; admin tab must `createAdminClient`).

---

## RLS

Re-measure `scripts/check-rls.mjs` (human; this pack does not run it). Manifest date 2026-08-19 is stale risk.

---

## Money invariants

Webhook body is never money. Sandbox/mock cannot be Production (`CARDCOM_SANDBOX` boot-fail, `CARDCOM_USE_MOCK` unset).

---

## Tests before close

`compromised-keys.test.ts`, `constant-time.test.ts`, `admin-key.test.ts`, `mutating-route-guards.test.ts`, `cron-auth.test.ts`, `rls-write-policies.test.ts`.

---

## Feature flag

`CHECKOUT_ENABLED=true` exact. Kill switches for cache/search/recs/notifications.

---

## Docs updated

`SECURITY-REVIEW.md`, `SECRETS` / `RUNBOOK-SECRET-ROTATION.md`, `LAUNCH-BLOCKERS.md`.

---

## Edge cases

Debug Sentry route 404 when off (not 403). `connection()` because `cacheComponents`. Do not put it under `/api/payments/`.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Checkout disabled | הרכישה סגורה זמנית |
| Rate limited | יותר מדי ניסיונות. נסה שוב מאוחר יותר. |

---

## Open questions

| Q | Best answer |
|---|---|
| Is the leaked service key still in Vercel? | Human must check. Preflight refuses the hash if it is. |

---

## Second pass (after contracts)

- Payment boundary: webhook `?s=` constant-time, body is not money, GetLpResult (`contracts/PAYMENT-BOUNDARY.md`).
- Cookie: never forward the browser jar (`contracts/CACHE-POLICY.md` / ARCHITECTURE D40).
- Rate limits: scan 30/min, PIN 15/hour must stay (`contracts/RATE-LIMITS.md`).
- Audit: admin mutations append; hash chain unverified (`contracts/AUDIT-LOG.md`).
- Secret rotation: `ops/RUNBOOK-SECRET-ROTATION.md`. Compromised SHA-256 denylist stays.
- `vendor` is not an admin bypass (`contracts/ROLE-VENDOR.md`).
