/**
 * WHICH ENVIRONMENT IS THIS PROCESS SERVING?
 *
 * `isDeployedRuntime` answers a different question -- "is a real customer able
 * to reach this" -- and answers it for security guards, so a preview deployment
 * counts as deployed there and must keep counting. This one separates the
 * deployments from each other, which is what a staging environment needs and
 * what nothing here could say before.
 *
 * WHY IT IS NOT A VARIABLE SOMEBODY SETS. `NEXT_PUBLIC_ENV_LABEL=staging` in
 * the preview environment would work exactly until somebody copied production's
 * variables into it, or promoted a preview to production, and then the banner
 * would be wrong in the one direction that matters: a production shop wearing a
 * "test environment" ribbon teaches customers to ignore it, and a staging shop
 * with no ribbon takes a real card number.
 *
 * `VERCEL_ENV` is set BY the platform per deployment and cannot be inherited
 * from another environment's variable list. It is the only value here that
 * describes the deployment rather than describing what somebody typed.
 *
 * Values, from Vercel's own vocabulary: `production`, `preview`, `development`.
 * Anything else, including absence, is `local` -- a laptop, a container, CI.
 */

export type DeployEnvironment = 'production' | 'preview' | 'development' | 'local'

export function deployEnvironment(
  source: Partial<NodeJS.ProcessEnv> = process.env,
): DeployEnvironment {
  const raw = source.VERCEL_ENV
  if (raw === 'production' || raw === 'preview' || raw === 'development') return raw
  return 'local'
}

/**
 * Should this deployment SAY it is not production?
 *
 * True for everything that is not production, including a laptop. A developer
 * looking at localhost knows where they are; the case this exists for is the
 * screenshot, the shared preview link and the tab left open for a week, where
 * the only difference between staging and the shop is the data behind it.
 *
 * The one environment that must never show it is production, and that is the
 * only value this returns false for -- so the failure mode of a wrong reading
 * is a banner where none was needed, never a missing one where it was.
 */
export function shouldShowEnvironmentBanner(
  source: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return deployEnvironment(source) !== 'production'
}
