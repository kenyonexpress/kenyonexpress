# G111: F15 auth (passkeys, WhatsApp OTP, email fallback)

## Already shipped (rc5 F15, verified, unchanged)
- Passkeys: `@simplewebauthn/server` + `/browser`; `/api/auth/passkey/register` and `/authenticate`; `PasskeySignIn`, `PasskeyManager`, `PasskeyBanner`. Flag `passkeys_enabled` (`NEXT_PUBLIC_PASSKEYS_ENABLED`) is **ON** by default, only `0/false/off` disables (`src/lib/auth/passkeys-flag.ts`).
- WhatsApp OTP over the Meta Cloud API (`src/lib/whatsapp/meta-cloud.ts`), codes HMAC-hashed in `auth_wa_otps` (migration 285), 10 min TTL, 3 wrong guesses burn a code.
- Email fallback: when Meta rejects the template (132000-132099, 131058) the same code is emailed through Resend and verified like a WhatsApp one.

## Added in G111
- Flag `wa_otp_enabled`, default **OFF** (`FLAG_WA_OTP_ENABLED`, DB key `wa_otp_enabled`). While off, `/api/auth/wa-otp/send` and `/verify` answer 404 `disabled`; the form shows a Hebrew "not available" message.
- `otp_attempts` rate limit: 3 sends per 15 minutes per phone (`wa-otp-send` policy, 900s window). Per-IP send cap (20/h) and verify cap (10/h) unchanged.
- Migration `314_wa_otp_enabled_flag.sql` in `migrations/pending/` seeds the flag as false.

## Not done
- Migration 314 is not applied: the Supabase MCP is unauthenticated here. Until applied, the flag reads from `FLAG_WA_OTP_ENABLED` (unset = off), so behaviour is already correct.
- No live Meta send or real passkey ceremony was run.
