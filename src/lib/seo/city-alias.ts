import { cityBySlugName } from '@/data/cities'

/**
 * `/c/<slug>` serves a city when the slug is one, and is an alias for
 * `/category/<slug>` otherwise.
 *
 * WHY THIS IS IN THE PROXY AND NOT ONLY THE PAGE. The page used to answer the
 * alias with `redirect()`. `/c/[slug]` is prerendered, and on the cache-MISS
 * render Next 16.4 sends that redirect with the `location` header twice
 * (measured 2026-11-03, C197: `curl -D -` on a fresh slug printed
 * `location: /category/pets` two times, `x-nextjs-cache: MISS`; the HIT that
 * followed printed it once). WebKit joins the two values and navigated to
 * `/category/pets,%20/category/pets`, a 404. Cities are a static list, so the
 * alias is known without rendering anything.
 *
 * Returns the target path, or null when the path is not a non-city `/c/<slug>`.
 * The segment is passed through as received (already percent-encoded).
 */
export function cityAliasTarget(pathname: string): string | null {
  const match = /^\/c\/([^/]+)\/?$/.exec(pathname)
  if (!match?.[1]) return null
  const segment = match[1]
  let slug: string
  try {
    slug = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (cityBySlugName(slug)) return null
  return `/category/${segment}`
}
