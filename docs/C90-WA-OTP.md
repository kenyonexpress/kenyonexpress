# C90: WhatsApp OTP (rc5 F15)

Sign-in by a 6-digit code sent over WhatsApp (Meta Cloud API), with an email
fallback. **Dark by default**: flag `wa_otp_enabled` is off until Meta business
verification and the AUTHENTICATION template approval are done.

## Pieces

| Piece | Where |
| --- | --- |
| Meta Cloud adapter (template `otp_code`, lang `he`) | `src/lib/whatsapp/meta-cloud.ts` |
| Code gen / HMAC hash / constant-time compare (10 min TTL, 3 wrong guesses) | `src/server/auth/wa-otp.ts` |
| Flag gate, send limits, `otp_attempts` audit writer | `src/server/auth/wa-otp-gate.ts` |
| Send route | `src/app/api/auth/wa-otp/send/route.ts` |
| Verify route (mints session) | `src/app/api/auth/wa-otp/verify/route.ts` |
| Codes table (mig. 285, applied) / audit + flag (mig. 312, **pending**) | `auth_wa_otps`, `otp_attempts`, `feature_flags` |

## Behaviour

- **Flag**: `waOtpEnabled()` reads `feature_flags.wa_otp_enabled`; `FLAG_WA_OTP_ENABLED=1`
  overrides. It **fails closed** (missing row, DB error, null: off). Off returns 404
  `disabled` from both routes and sends nothing.
- **Rate limit**: 3 sends per phone per 15 minutes (`WA_OTP_SEND_LIMIT`,
  `WA_OTP_SEND_WINDOW_SECONDS`), plus 20/hour per IP, via `checkRateLimit`. Verify is 10/hour
  per phone, and 3 wrong guesses burn the code.
- **Email fallback**: only when Meta rejects the template (error 132000-132099 or
  131058). The same code is emailed via Resend and verified identically. Any other
  Meta failure sends nothing and the caller may retry.
- **No enumeration**: the response is identical whether or not the number has an account.
- **Audit**: every send/verify writes an `otp_attempts` row (HMAC of the phone, last 4
  digits, outcome, ip). Writing is best-effort and never fails a request, so the
  routes work before migration 312 is applied (rate limiting does not depend on the table).

## Enabling (after Meta verification)

1. Apply `migrations/pending/312_otp_attempts_wa_otp_flag.sql` through the Supabase MCP.
2. Set `META_WABA_TOKEN`, `META_WABA_PHONE_ID`, optionally `META_WA_OTP_TEMPLATE`/`META_WA_OTP_LANGUAGE`.
3. `update public.feature_flags set bool_value = true where key = 'wa_otp_enabled';`
   (or `FLAG_WA_OTP_ENABLED=1`).

## Tests (Meta, Resend and Supabase mocked)

- `src/app/api/auth/wa-otp/wa-otp.routes.test.ts`: dark when off, send path stores only
  a hash, 3/900 limit and 429, template-rejection email fallback, no email on other
  failures, unknown number sends nothing.
- `src/server/auth/wa-otp-gate.test.ts`: flag default off, fails closed, env override.
- Existing: `src/lib/whatsapp/meta-cloud.test.ts`, `src/server/auth/wa-otp.test.ts`.

## Legacy

`src/lib/auth/whatsapp-otp.ts` is an older free-text adapter with no callers; the routes
use `meta-cloud.ts` (template messages, as Meta requires for OTP).
