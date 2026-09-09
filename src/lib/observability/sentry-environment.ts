import { type DeployEnvironment, deployEnvironment } from '@/lib/deploy-environment'

/**
 * The `environment` tag every Sentry event carries.
 *
 * =========================================================================
 * WHY THIS IS NOT `SENTRY_ENVIRONMENT ?? NODE_ENV`, WHICH IS WHAT IT WAS
 * =========================================================================
 *
 * `NODE_ENV` is `production` in every built Next app, so it cannot tell a
 * PREVIEW deployment from the shop. Both would report `environment: production`
 * and land in the same alert rule, which means the first thing an operator
 * learns from a paging alert is a guess about which deployment paged them.
 *
 * `SENTRY_ENVIRONMENT` is worse in the specific way `deploy-environment.ts`
 * already argues at length for the staging banner: it is a variable somebody
 * SETS, so it survives being copied from production's variable list into a
 * preview environment, and then it does not describe the deployment, it
 * describes an old copy-paste. `VERCEL_ENV` is set by the platform per
 * deployment and cannot be inherited.
 *
 * So the precedence is INVERTED from the obvious one: the platform value wins
 * when there is one, and the hand-set variable is the fallback for a deployment
 * that is not on Vercel at all.
 *
 * =========================================================================
 * WHAT THIS IS WORTH, MEASURED
 * =========================================================================
 *
 * Sentry, 30 days to 2026-09-10, whole project: 206 error events. 203 tagged
 * `development` and 3 tagged `sentry-wiring-check`. **Not one from production.**
 * `release` was null on every single one.
 *
 * The 203 are laptops: `SENTRY_DSN` is in `.env.local`, so local development
 * reports into the same project the shop reports into. That part is at least
 * labelled. What the numbers say is the other half: whatever is serving the
 * live site is sending nothing at all, which no amount of tagging fixes and
 * which this file therefore only makes visible rather than repairing.
 *
 * =========================================================================
 * THE CLIENT CANNOT READ `VERCEL_ENV`
 * =========================================================================
 *
 * Without the `NEXT_PUBLIC_` prefix it is not inlined into the browser bundle
 * and reads as undefined -- the identical trap `instrumentation-client.ts`
 * documents for the release SHA. The browser caller therefore passes
 * `NEXT_PUBLIC_VERCEL_ENV` in the `VERCEL_ENV` slot, and both callers must
 * reference `process.env.X` LITERALLY for Next to inline it; reading it off a
 * computed key yields undefined in the bundle.
 */

export type SentryEnvironment = DeployEnvironment | (string & {})

export function sentryEnvironment(source: Partial<NodeJS.ProcessEnv>): SentryEnvironment {
  const stage = deployEnvironment(source)
  if (stage !== 'local') return stage

  // Off-Vercel: a self-hosted build, CI, or a laptop. An explicit variable is
  // the only thing that can distinguish those, and `local` is the honest answer
  // when there is none. NOT `NODE_ENV`, which would call a laptop running
  // `next start` "production" and file its errors beside the shop's.
  const explicit = source.SENTRY_ENVIRONMENT?.trim()
  return explicit ? explicit : 'local'
}
