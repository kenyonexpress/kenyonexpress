/**
 * The URL segment of a campaign landing page, `/lp/<slug>`.
 *
 * Lower-case Latin letters, digits and single dashes, at most 60 characters.
 * Migration 262 carries the same CHECK, and `slug.test.ts` reads that file
 * so the two cannot drift: a slug the route would 404 cannot be saved, and a
 * saved slug always routes.
 *
 * Pure and dependency-free: the proxy, the route, the admin form and the
 * analytics stamp all import it, and the proxy runs on the edge.
 */

export const LANDING_PATH_PREFIX = '/lp/'
export const LANDING_SLUG_MAX_LENGTH = 60
export const LANDING_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isLandingSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= LANDING_SLUG_MAX_LENGTH &&
    LANDING_SLUG_PATTERN.test(value)
  )
}

/** `/lp/<slug>` for a valid slug, or null for anything else (no trailing slash, no query). */
export function landingSlugFromPath(pathname: string): string | null {
  if (!pathname.startsWith(LANDING_PATH_PREFIX)) return null
  const slug = pathname.slice(LANDING_PATH_PREFIX.length)
  return isLandingSlug(slug) ? slug : null
}

export function landingPath(slug: string): string {
  return `${LANDING_PATH_PREFIX}${slug}`
}
