# Security pass (G25)

| Item | State |
| --- | --- |
| pgTAP RLS, every public table | `tests/sql/rls_all_public_tables.test.sql`: 71 tables x (exists, RLS on, >=1 policy) + live-catalog completeness checks. Generated from `supabase/rls-manifest.json`; `rls-pgtap-coverage.test.ts` keeps the two in sync. Run with `supabase test db`. Not executed here: no local Postgres or authenticated Supabase MCP in this session. |
| gitleaks CI | `.github/workflows/gitleaks.yml` (push to main/closeout/**, every PR; gitleaks v8.18.4, `--redact`, new commits only). Already present. |
| CSP + HSTS | `curl -sI https://www.kenyonexpress.co.il/` on 2026-10-25: `content-security-policy` (default-src 'self', frame-ancestors 'none', object-src 'none', ...), `strict-transport-security: max-age=63072000; includeSubDomains`, `x-frame-options: DENY`, `x-content-type-options: nosniff`. Apex answers 308 to www with `max-age=63072000`. `preload` stays off per the 2026-09-08 TLS incident. Production `connect-src` has no `wss:` yet; the G23 fix is in code and ships with the next deploy. |
| Sentry sample rate | `tracesSampleRate: 1.0` in server, edge and browser configs. |
| PostHog identify | `identifyUser()` in `lib/observability/posthog.ts` sends `$identify` (user id only, behind the consent cookie, once per user per tab). Called from `AnalyticsProvider` on `SIGNED_IN` / `INITIAL_SESSION`. |
| Upstash rate limiter | Mutating routes that had none now call `checkRateLimit` (Upstash, then Postgres, then open): cardcom webhook, twilio webhook, products webhook, search index-job and index-dlq, cache purge (per IP, `lib/rate-limit/request-ip.ts`), admin product import, phone verify complete (per user). `orders/[id]/cancel` is limited inside `requestOrderRefund`; `supplier/redeem` and `supplier/verify-card` re-export routes that already limit. Policies are in `lib/rate-limit/policies.ts`. |

Pre-existing failures, unrelated and untouched: `migration-location-gate`, `log-coverage` (2), `route-guards` for `supplier/verify-card`.
