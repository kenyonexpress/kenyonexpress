# C11 — F19 Turnstile

**Result: SKIPPED (no real keys).**

## State of the code (already shipped, see C56-TURNSTILE-SETUP.md)
- Widget: `src/components/shared/TurnstileWidget.tsx` — renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. Used by login, signup, forgot/reset password, contact, supplier lead form, checkout, newsletter.
- Server verify: `src/lib/security/turnstile.ts` (`verifyTurnstile`), called from `api/auth/login`, `api/auth/signup`, `api/auth/forgot-password`, `api/contact`, `api/supplier/apply`. Fails closed once `TURNSTILE_SECRET_KEY` is set.
- Env keys documented in `.env.example`.

## Why skipped
- `.env.local` has no Turnstile keys.
- `.env.production` / `.env.vercel` hold a `[SENSITIVE]` placeholder as `TURNSTILE_SECRET_KEY`, not a real secret.
- Enabling with a placeholder would fail closed and lock every login/register/supplier-apply.

## To enable
Set a real `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` in Vercel env and redeploy. No code change needed.

RESULT: SKIPPED (no keys)
