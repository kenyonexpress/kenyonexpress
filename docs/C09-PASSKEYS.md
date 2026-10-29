# C09 - Passkeys (WebAuthn) with WhatsApp OTP fallback

Status: already shipped (rc5 F12/F15, commit 89e88f149). Re-verified 2026-10-29; no code change.
Extends docs/C04-passkeys.md.

## Pieces
- Libraries: `@simplewebauthn/server` 13.3.3, `@simplewebauthn/browser` 13.3.0 (installed in package.json).
- Config: `src/lib/auth/webauthn-config.ts` (rpID, rpName, origin).
- Challenge: signed httpOnly strict cookie, `src/lib/auth/challenge-cookie.ts`.
- Register + verify: `POST /api/auth/passkey/register`, body `step: 'options' | 'verify'`. Signed-in only, 20/h rate limit. Stores into `public.webauthn_credentials` (migration 178, service-role insert).
- Login: `POST /api/auth/passkey/authenticate`, same two-step shape, checks the signature counter and mints a session.
- UI banner: `src/components/auth/PasskeyBanner.tsx`, rendered on `/checkout/return` (post-purchase). Shown only to a signed-in customer with no passkey, WebAuthn supported, not dismissed (`ke_passkey_banner_dismissed`).
- Sign-in button: `PasskeySignIn` inside `LoginModal`; manage/remove on `/account/security` (`PasskeyManager`).
- Fallback: WhatsApp OTP via Meta Cloud API. `POST /api/auth/wa-otp/send` and `/verify`, sender in `src/lib/whatsapp/meta-cloud.ts` (Graph v21.0, `isMetaWhatsappConfigured` guard), code logic in `src/server/auth/wa-otp.ts`.

## Decision
No new migration or table: `webauthn_credentials` already covers the schema.

## Verification
`vitest run challenge-cookie.test.ts LoginModal.test.tsx phone-otp.test.ts`: 3 files, 30 tests passed.
Live register/login needs a real authenticator; live WhatsApp send needs Meta credentials. Neither was exercised here.

RESULT: DONE
