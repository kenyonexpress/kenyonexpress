/**
 * The `environment` tag every Sentry event carries.
 *
 * WHY THIS IS NOT `SENTRY_ENVIRONMENT ?? NODE_ENV`, WHICH IS WHAT IT WAS.
 *
 * `NODE_ENV` is `production` in every built Next app, so it cannot tell a
 * PREVIEW deployment from the shop, nor a laptop running `pnpm start` for the
 * pixel gate from either. All three reported `environment: production` and
 * landed in the same alert rule, so the first thing an operator learned from
 * a page was a guess about which deployment paged them.
 *
 * `SENTRY_ENVIRONMENT` is worse in a specific way: it is a variable somebody
 * SETS, so it survives being copied from production's variable list into a
 * preview environment, and then it describes an old copy-paste rather than
 * the deployment. `VERCEL_ENV` is set by the platform per deployment and
 * cannot be inherited.
 *
 * So the precedence is INVERTED from the obvious one: the platform value wins
 * when there is one, and the hand-set variable is the fallback for a
 * deployment that is not on Vercel at all. A laptop with neither reads
 * `local`, never `production`.
 *
 * MEASURED, 30 days to 2026-09-10, whole project: 206 error events, 203
 * tagged `development` and 3 `sentry-wiring-check`, zero from production.
 * The 203 were laptops: `SENTRY_DSN` is in `.env.local`, so local development
 * reports into the project the shop reports into. This file labels that
 * traffic so an alert rule can filter it; it cannot make the shop report.
 *
 * THE CLIENT CANNOT READ `VERCEL_ENV`. Without the `NEXT_PUBLIC_` prefix it
 * is not inlined into the browser bundle and reads as undefined, the same
 * trap `instrumentation-client.ts` documents for the release sha. The
 * browser caller passes `NEXT_PUBLIC_VERCEL_ENV` in the `VERCEL_ENV` slot and
 * `NEXT_PUBLIC_SENTRY_ENVIRONMENT` in the `SENTRY_ENVIRONMENT` slot, and both
 * callers must reference `process.env.X` LITERALLY for Next to inline it.
 *
 * Edge-safe and browser-safe: no imports at all.
 */

export type SentryEnvironment = 'production' | 'preview' | 'development' | 'local' | (string & {})

export type SentryEnvironmentSource = {
  VERCEL_ENV?: string
  SENTRY_ENVIRONMENT?: string
}

export function sentryEnvironment(source: SentryEnvironmentSource): SentryEnvironment {
  const platform = source.VERCEL_ENV?.trim()
  if (platform) return platform

  const explicit = source.SENTRY_ENVIRONMENT?.trim()
  return explicit ? explicit : 'local'
}
