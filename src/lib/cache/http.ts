/**
 * The Cache-Control vocabulary for route handlers, in one place.
 *
 * docs/ARCHITECTURE-PERFORMANCE.md section 7.2 and the CDN table in
 * ARCHITECTURE-PERFORMANCE-SEO.md section 5.5 both describe these strings,
 * and until now each route handler typed its own. Three routes carried the
 * search policy as three separate literals, two feeds carried a fourth, and a
 * typo in any one of them would have been a route that Vercel's CDN silently
 * stopped caching, with a 200 and nothing in a log.
 *
 * Pages do not use this. A page's cache life comes from `use cache` +
 * `cacheLife(...)` and the CDN header Next derives from it; a static header
 * on a page would fight that. This is for `route.ts` files, which set their
 * own headers and get no such derivation.
 *
 * `max-age=0` is deliberate on every public policy. `s-maxage` is read by the
 * shared cache (Vercel's edge) and `max-age` by the browser; a public policy
 * with a browser TTL means a shopper who searched a minute ago keeps seeing
 * the result of a product that has since sold out until their own cache
 * expires, with no purge that can reach them. The edge can be revalidated;
 * a browser cannot.
 */

/** `public, max-age=0, s-maxage=<sMaxAge>, stale-while-revalidate=<swr>` */
export function publicIsr(sMaxAgeSeconds: number, staleWhileRevalidateSeconds: number): string {
  if (!Number.isInteger(sMaxAgeSeconds) || sMaxAgeSeconds < 0) {
    throw new RangeError(`s-maxage must be a non-negative integer, got ${sMaxAgeSeconds}`)
  }
  if (!Number.isInteger(staleWhileRevalidateSeconds) || staleWhileRevalidateSeconds < 0) {
    throw new RangeError(
      `stale-while-revalidate must be a non-negative integer, got ${staleWhileRevalidateSeconds}`,
    )
  }
  return `public, max-age=0, s-maxage=${sMaxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
}

export const CacheControl = {
  /**
   * Search results and facets. The catalogue moves slowly and the same query
   * is retyped constantly during a sale; 30s at the edge absorbs a WhatsApp
   * burst on one term while a sold-out product still leaves the results
   * within the minute.
   */
  search: publicIsr(30, 60),
  /**
   * The product feeds (RSS, Google Merchant). Crawled, never browsed: an hour
   * at the edge with a day of stale serving means a feed fetch during a deploy
   * or a Supabase blip still gets yesterday's catalogue instead of a 500.
   */
  feed: publicIsr(3600, 86400),
  /**
   * Postal-code lookups. The table changes when Israel Post changes it, so a
   * day at the edge is conservative; the browser hour is the exception to the
   * `max-age=0` rule above because the answer for one postal code cannot go
   * stale in the way a search result can.
   */
  postalCode: 'public, max-age=3600, s-maxage=86400',
  /**
   * Anything keyed by the caller: a cart, a session, a wallet pass, a
   * suggestion list that was tuned to one person. `private` keeps it out of
   * every shared cache and `no-store` keeps it out of the browser's, so a
   * back-navigation after logout cannot show the previous shopper's cart.
   */
  private: 'private, no-store',
} as const

export type CacheControlPolicy = (typeof CacheControl)[keyof typeof CacheControl]

/**
 * Parsed directives, lower-cased, value-less ones as `true`. For tests and
 * for the coverage ratchet, which needs to ask "is this policy public" without
 * caring about the order the directives were typed in.
 */
export function cacheControlDirectives(value: string): Record<string, string | true> {
  const out: Record<string, string | true> = {}
  for (const part of value.split(',')) {
    const directive = part.trim().toLowerCase()
    if (!directive) continue
    const eq = directive.indexOf('=')
    if (eq === -1) out[directive] = true
    else out[directive.slice(0, eq)] = directive.slice(eq + 1)
  }
  return out
}

/** True when a shared cache is permitted to store the response. */
export function isSharedCacheable(value: string): boolean {
  const d = cacheControlDirectives(value)
  if (d.private || d['no-store']) return false
  return d.public === true || typeof d['s-maxage'] === 'string'
}

/**
 * Content-addressed or path-keyed binary assets (the R2 image proxy): a year in
 * every cache, never revalidated. Kept OUT of `CacheControl` on purpose -- that
 * object is the set of policies for data that can change, and it promises no
 * browser TTL; an immutable asset is the one case that wants the opposite.
 */
export const ImmutableAsset = 'public, max-age=31536000, immutable'

/**
 * The mobile app's product-detail JSON: an hour in the browser, as the app was
 * built to expect. Outside `CacheControl` for the same reason as
 * `ImmutableAsset`: that object promises no browser TTL on public data.
 */
export const MobileProductCache = 'public, max-age=3600'

/**
 * Stamps `policy` on every response a route handler returns, unless the handler
 * already set a Cache-Control of its own. For routes whose responses are all
 * one policy (secret-gated or admin-only GETs are all `CacheControl.private`),
 * this is one line at the export instead of a header on each of a dozen
 * `NextResponse.json` calls that the next edit would forget.
 */
export function withCacheControl<Args extends unknown[], R extends Response>(
  policy: string,
  handler: (...args: Args) => Promise<R> | R,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const response = await handler(...args)
    try {
      if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', policy)
    } catch {
      // Immutable headers (a proxied fetch Response): the handler owns them.
    }
    return response
  }
}
