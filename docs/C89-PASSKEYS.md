# C89 Passkeys (rc5 F15)

Built earlier (F12/F15) and verified/completed here.

- Routes: `POST /api/auth/passkey/register` (`step: options|verify`, signed-in only) and
  `POST /api/auth/passkey/authenticate` (`step: options|verify`), using `@simplewebauthn/server` 13.
  Challenge travels in the HMAC-signed `ke_wa_chal` cookie (`src/lib/auth/challenge-cookie.ts`).
- Table: `public.webauthn_credentials` (id, user_id, public_key, counter, transports, device_type,
  backed_up, friendly_name, last_used_at). Per `migrations/pending/README.md` it already exists in
  the live DB; no new migration written.
- UI: `PasskeySignIn` on `/login` (LoginForm) and LoginModal; `PasskeyBanner` on `/checkout/return`
  after a purchase (signed-in, no passkey yet, dismissible); `PasskeyManager` on `/account/security`.
- Flag `passkeys_enabled` = env `NEXT_PUBLIC_PASSKEYS_ENABLED`, **default ON**; `0`/`false`/`off`
  hides the login button and banner and makes both routes return 404.
  Code: `src/lib/auth/passkeys-flag.ts`.
- Tests: `passkeys-flag.test.ts`, `src/app/api/auth/passkey/passkey-routes.test.ts` (flag off -> 404,
  options + cookie, missing challenge, unknown step, unauthenticated register), plus existing
  challenge-cookie tests. 324 tests in src/lib/auth + src/components/auth + the routes pass; tsc and biome clean for touched files.

## Not verified
`./db.sh` fails (`password authentication failed`, same as C80), and the Supabase MCP is unauthorised
in this session, so the existence and RLS of `webauthn_credentials` in the live DB could not be
re-checked here. Fix the `ke-supabase-db` keychain password (see C80) and run
`./db.sh -c "\d public.webauthn_credentials"`.
