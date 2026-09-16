import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { parseFacetedParams } from '@/lib/search/faceted'
import { facetedSearch } from '@/lib/search/faceted-server'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Faceted search over the product catalogue: the transport for
 * `lib/search/faceted-server.ts`, which the results page calls directly.
 * Everything this route does that the engine does not is HTTP: parameter
 * parsing to a 400, a rate limit, cache headers.
 */

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const parsed = parseFacetedParams(searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ results: [], facets: {}, error: parsed.error }, { status: 400 })
  }

  // Separate bucket from /api/search: this route carries filters and facet
  // counting, so its honest ceiling is lower than the type-ahead-adjacent one.
  const ip = await getClientIp()
  const decision = await rateLimit('search-facets', ip)
  if (!decision.allowed) {
    return NextResponse.json(
      { query: parsed.params.q, results: [], facets: {}, error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  const outcome = await facetedSearch(parsed.params)
  if ('error' in outcome) {
    return NextResponse.json(
      { query: parsed.params.q, results: [], facets: {}, error: outcome.error },
      { status: 500 },
    )
  }
  // The raw `images` column is the page's business, not the API's: the wire
  // shape stays what it was before the engine moved out of this file.
  const results = outcome.results.map(({ images: _images, ...hit }) => hit)
  return NextResponse.json(
    { ...outcome, results },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  )
}

export const GET = withRequestLog('/api/search/facets', handleGET)
