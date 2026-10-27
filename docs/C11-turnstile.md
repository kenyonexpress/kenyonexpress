# C11 — F19 Turnstile

Status: SKIPPED (no keys) — 2026-10-27

No `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` in `.env.local` or the environment.

Already in code: `src/lib/security/turnstile.ts` (`verifyTurnstile`, `TURNSTILE_FIELD`), called server-side from
`server/actions/auth.ts`, `supplier-lead.ts`, `contact.ts`, `newsletter.ts`, `payments/checkout.ts`; widgets in
Login/Signup/Forgot/Reset/Checkout forms.

To activate: set the site + secret keys in Vercel and `.env.local`. No code change needed.
