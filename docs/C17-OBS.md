# C17 — Observability audit (Sentry, PostHog, Axiom)

Date: 2026-10-29. Result: **DONE-DEFERRED** (code complete; live Sentry verification blocked on a real `SENTRY_AUTH_TOKEN`).

## Sentry source maps in CI
- `next.config.ts` wraps the config last with `withSentryConfig` (org `kenyonexpress`, project `kenyonexpress-web`, host `de.sentry.io`), uploads maps and deletes them from the output afterwards (`SENTRY_KEEP_SOURCEMAPS=1` keeps them).
- `.github/workflows/ci.yml` build job passes `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` from secrets, and `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` = `github.sha` so maps attach to the release the runtime reports.
- Without a token the plugin skips the upload, so forks stay green.
- Verification scripts: `pnpm sentry:verify`, `pnpm sentry:verify:ci`.
- **Open:** production `SENTRY_AUTH_TOKEN` is still a placeholder; builds log `401 invalid token` for the upload (M14, DONE-DEFERRED). Once a real token is set in Vercel and GitHub secrets, re-run `pnpm sentry:verify` and confirm a release with artifacts in Sentry.

## PostHog
- Client: `src/lib/observability/posthog.ts` + `src/components/analytics/AnalyticsProvider.tsx` (consent-gated pageviews, `view_product`, `add_to_cart`, `remove_from_cart`, `checkout_step`, ...).
- `purchase` is deliberately emitted **server-side only** (`src/server/analytics/track.ts`), so a closed tab cannot lose a paid order.
- Smoke test: `NEXT_PUBLIC_POSTHOG_KEY=... node scripts/verify-posthog-capture.mjs`.

## Axiom log drain
- Ingest helper `src/lib/observability/axiom.ts` (unit tests in `axiom.test.ts`); smoke test `AXIOM_TOKEN=... AXIOM_DATASET=... node scripts/verify-axiom-drain.mjs`.

## Environment status (names only, from `vercel env ls`, project `kenyonexpress`)
| Variable | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | set | set | set |
| `POSTHOG_API_KEY` | set | — | — |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | set | set | — |
| `SENTRY_AUTH_TOKEN` | set (placeholder, 401) | — | — |
| `AXIOM_TOKEN` / `AXIOM_DATASET` | set | — | — |

## Verification status
- Verified: variables exist in production; code paths and CI wiring present.
- **Not verified live:** secret values are hidden in Vercel and not in `.env.local`, so the PostHog/Axiom smoke scripts were not run against production; Sentry upload cannot succeed until the token is replaced. The staging project (`kenyonexpress-staging`) was not inspected (Vercel MCP env listing returned 404).
- Next step once creds are available: run the three verify scripts with production values and record the results here.
