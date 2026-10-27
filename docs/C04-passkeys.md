# C04 - F15 Passkeys (WebAuthn)

Status: already shipped (rc5 F12/F15, commit 89e88f149). Re-verified 2026-10-27; no code change.

## Decision: no `passkey_credentials` migration
The queue text names a `passkey_credentials` table. The shipped, applied table is
`public.webauthn_credentials` (migration 178, @simplewebauthn shape: id, user_id,
public_key, counter, transports, device_type, backed_up, friendly_name; RLS select_own
and delete_own, inserts via service role). A second table would duplicate it and
split credentials, so none is added (see migrations/pending/README.md, 285 entry).

## Pieces
- Library: `@simplewebauthn/server` 13.3.3, `@simplewebauthn/browser` 13.3.0.
- Config: `src/lib/auth/webauthn-config.ts` (rpID, rpName, origin).
- Challenge: signed httpOnly strict cookie, `src/lib/auth/challenge-cookie.ts` (tested).
- Register (options + verify): `src/app/api/auth/passkey/register/route.ts`, signed-in only, rate limited 20/h.
- Authenticate (options + verify): `src/app/api/auth/passkey/authenticate/route.ts`, checks signature counter, mints session.
- UI: `src/app/(account)/account/security/page.tsx` renders `PasskeyManager` (list, add, remove); sign-in via `PasskeySignIn` / `LoginModal`.

## Verification
`vitest run challenge-cookie.test.ts LoginModal.test.tsx`: 2 files, 18 tests passed.
Live register/authenticate needs a real authenticator and was not exercised here.

RESULT: DONE
