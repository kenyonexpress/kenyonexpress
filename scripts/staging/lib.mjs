/**
 * The staging environment, as fixed identifiers and the two decisions the
 * scripts around it make (STEP 69). Read docs/STAGING.md for the topology.
 *
 * Everything here was read from the Vercel and Supabase management APIs on
 * 2026-10-14, not assumed: the project id, the team, the domain and the branch
 * ref. The one thing that is a RULE rather than a measurement is
 * `PRODUCTION_HOSTS`: the hosts on which a staging marker is a defect.
 */

export const STAGING_PROJECT_ID = 'prj_7Ar3dFtaIqemo7bc1Fg7SMh11joY'
export const STAGING_PROJECT_NAME = 'kenyonexpress-staging'
export const STAGING_TEAM_ID = 'team_TUMTPVDP8218QHwedSjmgJWl'
export const STAGING_HOST = 'staging.kenyonexpress.co.il'
export const STAGING_SUPABASE_REF = 'sjojzzppqhjxvjlvnwdb'
export const PRODUCTION_SUPABASE_REF = 'ixvwfbuvfxxsjiywhbbb'
export const STAGING_PASSWORD_HEADER = 'x-staging-password'

export const PRODUCTION_HOSTS = new Set(['kenyonexpress.co.il', 'www.kenyonexpress.co.il'])

/** The hostname of a URL-shaped string, lower-cased, or null when it is not one. */
export function hostOf(url) {
  if (!url || typeof url !== 'string') return null
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The names of every staging marker present in an environment. A marker is a
 * value that only the staging project should carry: the gate password, the
 * Sentry label `staging`, or a Supabase URL that points at the staging branch.
 */
export function stagingMarkers(env = process.env) {
  const markers = []
  if (env.STAGING_PASSWORD?.trim()) markers.push('STAGING_PASSWORD')
  if (env.SENTRY_ENVIRONMENT?.trim() === 'staging') markers.push('SENTRY_ENVIRONMENT=staging')
  if (env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() === 'staging') {
    markers.push('NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging')
  }
  const supabaseHost = hostOf(env.NEXT_PUBLIC_SUPABASE_URL)
  if (supabaseHost?.startsWith(`${STAGING_SUPABASE_REF}.`)) {
    markers.push(`NEXT_PUBLIC_SUPABASE_URL=${STAGING_SUPABASE_REF}`)
  }
  return markers
}

/**
 * Staging markers on the production host: the one environment shape that is
 * wrong in both directions. With the password the shop is locked to its
 * customers; with the branch URL it sells from a database nobody reconciles.
 * Null when the environment is fine, otherwise the host and the markers.
 */
export function stagingMarkersOnProductionHost(env = process.env) {
  const host = hostOf(env.NEXT_PUBLIC_APP_URL)
  if (!host || !PRODUCTION_HOSTS.has(host)) return null
  const markers = stagingMarkers(env)
  return markers.length ? { host, markers } : null
}

/** The header a machine sends to pass the gate; empty when there is no password to send. */
export function stagingHeaders(password) {
  const value = typeof password === 'string' ? password.trim() : ''
  return value ? { [STAGING_PASSWORD_HEADER]: value } : {}
}

/**
 * The environment a `vercel deploy` needs to address the staging project
 * from ANY directory, without a `.vercel/project.json`. The CLI honours
 * VERCEL_ORG_ID + VERCEL_PROJECT_ID over the link file, which is the point:
 * the main checkout is linked to `kenyonexpress-prod` and must stay so.
 */
export function stagingDeployEnv(base = process.env) {
  return { ...base, VERCEL_ORG_ID: STAGING_TEAM_ID, VERCEL_PROJECT_ID: STAGING_PROJECT_ID }
}
