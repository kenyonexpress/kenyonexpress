# C15 — Security audit (CSP, HSTS, X-Frame-Options, rate limits, SQLi, RLS)

Date: 2026-10-27 · Branch: closeout/v1-final

## 1. Headers
| Header | Where | Status |
|---|---|---|
| Content-Security-Policy | `src/proxy.ts` via `contentSecurityPolicyFor(pathname)` (`src/lib/security/frame-policy.ts`) | implemented, path-dependent; nonce generated but deliberately not in the policy (cacheComponents shell carries no nonce, `strict-dynamic` would block it) |
| X-Frame-Options | `src/proxy.ts` via `frameOptionsFor()` (DENY, SAMEORIGIN on the Cardcom frame-return path); also `vercel.json` | implemented |
| Strict-Transport-Security | `next.config.ts` (`max-age=63072000; includeSubDomains`, no `preload` by design) + `vercel.json` | implemented |
| X-Content-Type-Options, Referrer-Policy, Permissions-Policy | `next.config.ts` / `src/proxy.ts` | implemented |

Unit tests: `src/lib/security`, `src/proxy` — 64 pass.
Live check: `curl -I https://kenyonexpress.co.il` returned only `strict-transport-security: max-age=63072000`; no CSP / X-Frame-Options. That is the production deployment as of today (not this branch's build), so it is unverified live until the branch deploys. Re-check after deploy.

## 2. Rate limits
Limiter: `src/lib/rate-limit.ts` (Upstash → Postgres `check_rate_limit` → fail-open).
Audit of all 78 `src/app/api/**/route.ts`:
- Already limited: auth, search, checkout/payments, voucher redeem and verify-card (the `/api/supplier/redeem` and `/api/supplier/verify-card` routes re-export limited handlers), etc.
- Cron (`/api/cron/*`), `admin/seed-search`: bearer `CRON_SECRET`; not public, no limit needed.
- Admin/supplier session-gated (`admin/reports/[report]`, `supplier/payouts/csv`): authenticated, no limit added.
- `health`, `ready`, `debug/sentry`, `test/push-verify`: operational endpoints, left as is.
- **Gap closed this item** (new `src/lib/rate-limit/route-guard.ts` → `limitByIp`, 429 + `Retry-After`):
  - `GET /api/cart` 120/min · `GET /api/search/quick-links` 120/min
  - `GET /api/mobile/products/[slug]` 120/5min · `GET /api/wallet/apple/[id]` 30/5min
  - `GET /api/supplier-apply/card-verify` 20/hour · `GET|HEAD /api/images/r2` 600/min (GET)
- Also hardened `/api/images/r2`: rejects `..` path segments before proxying.
- Residual: `HEAD /api/images/r2` is not limited (no body, same fixed upstream host).

## 3. SQL injection audit
- No raw SQL in `src/`: no `sql.raw`, `.unsafe(`, `.query(`, drizzle/pg clients in app code. All access is Supabase query builder / RPC (parameterised).
- PostgREST filter-string injection (`.or(...)` with interpolation) reviewed:
  `api/search` and admin audit-log/users/orders use `sanitize` / `sanitizeOrTerm`; `category-page.ts` interpolates constants only; `referrals.ts` interpolates the authenticated `user.id`.
- `EXECUTE format` appears only in migrations (DDL generation over catalog names), not user input.
- Result: no injectable path found.

## 4. RLS
Live check (`node scripts/check-rls-coverage.mjs`, project ixvwfbuvfxxsjiywhbbb, 2026-10-27): **127 public tables, 127 with RLS enabled, 0 without.** Prior report: `docs/RLS-COVERAGE.md`.
Scope: this verifies `rowsecurity = true` per table, not the content of each policy; policy-level tests live in `scripts/run-rls-tests.sh`.

## 5. Verification
`tsc --noEmit` clean · `vitest src/app/api` 354 pass · `vitest src/lib/rate-limit src/lib/security src/proxy` pass · biome clean on touched files.
