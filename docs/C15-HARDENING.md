# C15 — Turnstile, rate limiting, CSP + HSTS

## Turnstile (Cloudflare)
- Server check: `src/lib/turnstile.ts` (route handlers) and `src/lib/security/turnstile.ts` (server actions). Fails closed on a missing/bad token once `TURNSTILE_SECRET_KEY` is set; passes (with a one-time warning) when it is unset.
- Widget: `src/components/shared/TurnstileWidget.tsx`, key `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Wired on: checkout (`src/server/actions/payments/checkout.ts`, `CheckoutForm.tsx`), `/api/supplier/apply`, `/api/contact`, plus login, signup, forgot-password.
- Keys: present in `.env.vercel.production`. `.env.production` secret is only 13 chars, so confirm it is the real secret before launch.

## Rate limiting (Upstash)
- Limiter chain: Upstash, then Postgres `check_rate_limit`, then fail-open (`src/lib/rate-limit/limiter.ts`).
- New policy `auth-burst`: 10 requests / 60 s per IP, applied in `/api/auth/login`, `/signup`, `/forgot-password` after the existing per-route limits (login 5/15 min, signup 3/h, reset 3/h), which stay stricter.
- `UPSTASH_REDIS_REST_URL` / `_TOKEN` are not set in any env file. Until they are, the Postgres path enforces the same limits.

## CSP + HSTS
- HSTS: `max-age=63072000; includeSubDomains` in `next.config.ts`. `preload` stays off until the certificate has served cleanly for two weeks (see docs/incidents/2026-09-08-production-tls-down.md).
- CSP: built per request in `src/proxy.ts` from `src/lib/security/frame-policy.ts`. It allows `https://challenges.cloudflare.com` for `script-src` and `frame-src`, and Cardcom for `frame-src`.

## Verification
- `tsc --noEmit` clean; `vitest run src/lib/rate-limit src/app/api`: 48 files / 415 tests pass.
- Not exercised: live Turnstile siteverify and live Upstash (no verified creds in this session).
