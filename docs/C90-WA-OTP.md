# C90 WA-OTP (F15) - re-run 2026-10-30

Already implemented (C100/G111); verified, no code change needed.

- Adapter: `src/lib/whatsapp/meta-cloud.ts` (`sendWhatsappOtp`, Meta Cloud API).
- Routes: `POST /api/auth/wa-otp/send` and `/verify`; both answer 404 while flag `wa_otp_enabled` is off.
- Table: `auth_wa_otps` (migration 285, applied): HMAC of the code only, 10 min TTL, attempts cap 3, single use. Plays the role of `otp_attempts`.
- Rate limit: 3 sends per 15 min per phone (`wa-otp-send`), 20/h per IP, 10 verifies/h per phone (`src/lib/rate-limit/policies.ts`).
- Fallback: WhatsApp unconfigured or template rejected -> SMS -> account email via Resend. Same code verifies on any channel. Transient failure sends nothing.
- Flag: `wa_otp_enabled` default off (`migrations/pending/314_wa_otp_enabled_flag.sql`, env `FLAG_WA_OTP_ENABLED`). Migration 314 apply deferred: DB credentials rejected (same blocker as C81/C83).
- Tests with mock: `src/server/auth/wa-otp.test.ts` plus flags tests pass (pnpm vitest).

RESULT: DONE
