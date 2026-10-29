# C88 Turnstile wiring

Turnstile covers checkout, supplier/apply, contact, signup and login (plus forgot-password, newsletter).

- Server verify lib: `src/lib/security/turnstile.ts` (`verifyTurnstile`, `turnstileEnabled`), re-exported from `src/lib/turnstile.ts`.
- Widget: `src/components/shared/TurnstileWidget.tsx`.
- Flag `turnstile_enabled` = env `NEXT_PUBLIC_TURNSTILE_ENABLED` (server and widget read the same value).
  - ON only if `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are both set.
  - `0` / `false` forces it off even with keys. Unset = follows the keys.
  - Off: check passes (honeypot + rate limits remain). On: missing/rejected token or unreachable verifier fails closed.
- Tests (fetch mocked): `src/lib/security/turnstile.test.ts` plus route tests for contact, signup, login, forgot-password and supplier/apply.
- Keys are not yet present, so Turnstile stays off in every environment until they are added (see docs/TURNSTILE-SETUP.md).
