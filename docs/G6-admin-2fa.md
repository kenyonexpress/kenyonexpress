# G6: admin two-factor authentication (05.11.2026)

Queue item G6: TOTP enrolment with a QR code, a challenge on every admin route
for sessions that have not proven it, backup codes, forced enrolment for
staff roles, and a test suite. TOTP already existed for one role; this item
widens it, adds recovery, and makes the suite able to live with it.

## What existed before (measured)

Supabase native MFA (`auth.mfa.*`), a `/admin-mfa` page with enrol (QR +
secret) and challenge ceremonies, and a gate in `lib/admin/rbac.ts` that
forced **super_admin only**. `mfa_totp_enroll_enabled` and
`mfa_totp_verify_enabled` are on in the project's auth config. No staff user
(1 super_admin, 2 admin, 1 content_uploader) held any factor. No backup codes
anywhere. Customers had a `/account/security` page for passkeys only.

## What this item changed

| area | change |
|---|---|
| policy | `lib/admin/mfa-gate.ts`: `staffMfaGate` forces `super_admin`, `admin`, `content_uploader` (`MFA_FORCED_ROLES`). `support` and `read_only` stay at aal1. `superAdminMfaGate` remains as an alias. |
| server guards | `lib/admin/rbac.ts` `enforceStaffMfa` runs inside every `require*Session` guard, so pages and server actions alike refuse an aal1 session of a forced role. |
| route-level check | `src/proxy.ts`: on `/admin` and `/admin/*` (not `/admin-mfa`), a forced role whose session is not aal2 is redirected to `/admin-mfa?mode=enrol|challenge` from the assurance level the auth server reports. |
| ceremonies | `server/mfa/service.ts` holds enrol, verify, status, issue backup codes, redeem. `server/actions/mfa.ts` is the redirecting transport; `/api/auth/mfa` (GET status; POST enroll, verify, backup_codes, redeem) is the JSON one, same-origin only, per-address rate limit `mfa-api`. |
| backup codes | `lib/auth/backup-codes.ts`: 8 codes of 10 chars (no 0/O/1/I), shown once as `XXXXX-XXXXX`, stored as sha256(salt+code) with a 16-byte per-user salt in `auth.users.app_metadata.mfa_backup`. Issuing needs an aal2 session with a verified factor. |
| recovery | A valid code consumes itself, deletes every TOTP factor on the account (admin API), sends the security alert, and the gate sends the person to enrol a new one. The `/admin-mfa` challenge screen carries the "no access to the app? use a backup code" form. |
| account UI | `components/account/TotpManager.tsx` on `/account/security`: enrol, verify, issue and show backup codes, with the Hebrew copy in `messages/*.json` under `totp`. |
| admin UI | `/admin-mfa` accepts every forced role (it used to redirect non-super_admin to `/admin`, which the proxy now sends straight back: a loop with no form, measured on the first probe). |
| rate limits | four policies registered and documented: `mfa-backup-issue`, `mfa-backup-redeem`, `mfa-backup-redeem-ip`, `mfa-api`. |
| E2E | `e2e/totp.ts` (RFC 6238, no dependency), `auth-session.ts` proves MFA through `/admin` for the admin fixture, `scripts/e2e/enrol-admin-totp.mjs` enrolled a verified factor on `e2e-admin@test.kenyonexpress.local` (secret in `.env.local` as `E2E_ADMIN_TOTP_SECRET`, never committed). The a11y sign-in hook got a 90 s budget. |
| tests | `tests/auth/mfa.spec.ts` (gate for the three roles, enrol + verify through the route, backup issue/redeem/consume, cross-origin refusal) and `lib/auth/backup-codes.test.ts`. |

## Why a backup code resets instead of signing in

Supabase has no backup-code concept: only a verified factor lifts a session
to aal2, and nothing this app writes can mint an aal2 session. A code that
"signed in" would have to bypass the gate in application code, which is the
hole the gate exists to close. Resetting the factor keeps every admin page
behind a real second factor at all times; the cost is one re-enrolment after
a lost phone, which the codes make possible without an operator.

## Why app_metadata and not a table

`migrations/pending/` cannot be applied to production without approval, and a
backup-code table that is not live is a recovery that does not exist on the
day it is needed. `app_metadata` is server-only, never in the user-editable
metadata, written through the admin client, and live today.

## Measured

Probe on the rebuilt `pnpm start` (admin fixture, x-test-secret header):
sign-in -> `/` -> `/admin` -> `/admin-mfa?mode=challenge` -> code accepted ->
`/admin` -> `/admin/orders` at aal2, 26 s end to end.

E2E, admin fixture at aal2 (`a11y-authenticated.spec.ts`, `admin-product-upload.spec.ts`,
`admin-refund.spec.ts`, chromium, bypass header + `E2E_ADMIN_TOTP_SECRET`):
**77 passed, 5 failed in 11.0 min**, and none of the five is the gate:

- `/admin/fraud`, `/admin/users`: color-contrast (serious) on the admin
  decision buttons, the same finding both launch audits recorded.
- `/admin/payments`: the 30 s test budget, a heavy page on this laptop.
- product upload: `#prod-type` resolves to two elements (strict mode), a
  pre-existing duplicate id on that form.
- admin refund: the "נוסף לסל" confirmation never appears on a non-mock build
  (E2E money recipe).

Before the `/admin-mfa` role fix the same run lost every admin test to a
redirect loop (52 failed, "execution context destroyed"), and before the
sign-in helper learned the ceremony, 14 of them timed out at the hook.

Gates: `pnpm type-check` 0 errors; `pnpm lint` exit 0 (i18n ratchet at the
564 ceiling after moving the new copy into the catalogue); vitest: the three
inventory gates (`mutating-route-guards`, `auth-coverage`,
`rate-limit/policies` + `docs-table`) green, `tests/auth/mfa.spec.ts` green.

## Follow-ups, not done here

- Ofir's own staff accounts hold no factor yet: the next `/admin` visit of each
  one lands on enrolment. That is the forced enrolment the item asked for.
- The security-alert email reuses the `totp_enabled` copy for a backup-code
  reset; a dedicated sentence needs two catalogue keys and an email ratchet
  bump.
- Phone or WebAuthn as MFA factors stay off in the project config.
