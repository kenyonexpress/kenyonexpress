# C05 — F15 WhatsApp OTP (Twilio)

- `POST /api/auth/wa-otp/send`: rate limit 3 per hour per phone (20/hour per IP). Channel order: Twilio WhatsApp
  (`sendTwilioWhatsappOtp`, needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
  `TWILIO_WA_OTP_CONTENT_SID`) -> Meta Cloud -> account email (Supabase email OTP). Response is identical whether or
  not the number has an account.
- `POST /api/auth/wa-otp/verify`: unchanged (hashed code, attempt cap, 10/hour limit).
- Without Twilio credentials the sender is skipped and the email fallback delivers the code.
- Tests: `src/lib/whatsapp/twilio.test.ts`.
