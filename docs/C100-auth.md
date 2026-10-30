# C100 Passkeys + WhatsApp OTP (F15)

Most of F15 shipped earlier (C04/C89/G111). C100 closes the gaps.

## Already present (verified, unchanged)
- `@simplewebauthn/server` 13.3.3 and `/browser` 13.3.0 installed.
- Face ID / Touch ID flow: `/api/auth/passkey/register` + `/authenticate`, `PasskeySignIn`, `PasskeyManager`, `PasskeyBanner`. Credentials in `public.webauthn_credentials`.
- WhatsApp OTP over Meta Cloud API (`src/lib/whatsapp/meta-cloud.ts`, approved template `otp_code`), HMAC-only codes in `auth_wa_otps`, 10 min, 3 wrong guesses burn a code. Flag `wa_otp_enabled` (migration 314).

## Added in C100
- **3 passkey failures -> OTP**: `PasskeySignIn` counts failed attempts (a cancelled dialog does not count); at `PASSKEY_MAX_FAILURES` (3, `src/lib/auth/passkey-fallback.ts`) it replaces the button with `WhatsappOtpForm`.
- **Channel chain** in `/api/auth/wa-otp/send`: WhatsApp -> SMS (Twilio, `src/lib/sms/send-otp-sms.ts`) -> email (Resend). The chain advances only when Meta is unconfigured or rejects the template; a transient error sends nothing so the caller can retry. The same code is valid on any channel.
- **Bug fix**: the email-fallback verify step posted `{email, code}` but `/verify` only accepts a phone, so an emailed code could never sign in. The form now always verifies with the phone.
- **Migration** `migrations/pending/317_user_passkeys_phone_verifications.sql`: table `user_phone_verifications` (user, phone, channel, purpose, verified_at; RLS own-read), `auth_wa_otps.channel` column, and `user_passkeys` as a security_invoker view over `webauthn_credentials` (a second table would split the credentials, same call as 316). `/verify` writes the log row best-effort, so code works before and after the migration.
- Tests: `send-otp-sms.test.ts`; existing auth suites pass (89 in components/auth, api/auth, lib/sms).

## Not done
- Migration 317 is not applied: Supabase MCP needs OAuth, unavailable in this non-interactive session. Apply it via MCP `apply_migration` on ixvwfbuvfxxsjiywhbbb.
- No live Meta/Twilio send or real passkey ceremony was run. SMS needs `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER`.
- `wa_otp_enabled` stays OFF by default; turn it on to expose the OTP routes.
