# L12 Hardening report (C13)

Audit-and-verify pass. Every control below already existed in the repo; no source changes were needed. Verified 2026-10-25 with `vitest run src/lib/security src/lib/rate-limit src/lib/flags src/components/maintenance src/proxy`: 16 files, 135 tests, all passing.

| Control | Status | Where |
|---|---|---|
| Upstash rate limits | EXISTS | `src/lib/rate-limit/upstash.ts`; applied in server actions (auth, contact, newsletter, supplier-lead, checkout, cart, referrals, affiliate, refunds). Strategy: `docs/security/RATE-LIMITING-STRATEGY.md`. Env: `UPSTASH_REDIS_REST_URL/TOKEN` (see `.env.example`). |
| Turnstile on public forms | EXISTS | `src/lib/security/turnstile.ts` (server verify) + `TurnstileWidget.tsx`; wired into login, signup, forgot/reset password, contact, newsletter, supplier lead, checkout. |
| CSP | EXISTS | Path-dependent nonce CSP set in `src/proxy.ts` (`contentSecurityPolicyFor`). Single CSP header (duplicates avoided, see `next.config.ts`). |
| HSTS | EXISTS | `max-age=63072000; includeSubDomains` in `next.config.ts` and `vercel.json`. `preload` intentionally omitted until the cert has served cleanly for two weeks (`docs/incidents/2026-09-08-production-tls-down.md` 5.1). |
| gitleaks in CI | EXISTS | `.github/workflows/gitleaks.yml` (new commits, push + PR) and advisory whole-tree job in `ci.yml`. |
| Sentry alerts | PARTIAL, DONE-DEFERRED | `ops/sentry-alerts.json`: 2 live rules (high-priority issue, API Health uptime), desired rules recorded. Creating more needs `SENTRY_AUTH_TOKEN`, which is not set in any environment. Create them once the token exists. |
| Feature flags | EXISTS | `src/lib/flags/*` (Supabase-backed), admin UI `/admin/feature-flags`, action `src/server/actions/admin/feature-flags.ts`. |
| Maintenance mode | EXISTS | `src/lib/security/maintenance*.ts`, enforced in `src/proxy.ts`, page `/maintenance`, banner component. Admin and login exempt. |

No forbidden files touched. No migrations.
