import { withRequestLog } from '@/lib/observability/with-request-log'
import { searchProductsCached } from '@/lib/search-server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { NextResponse } from 'next/server'

/**
 * Type-ahead suggestions for the header search box.
 *
 * This exists because the browser cannot ask Meilisearch directly. The engine is
 * reached with `MEILISEARCH_API_KEY`, a server secret, so a client-side fetch to
 * the engine would either ship the key in the bundle or need a public key we do
 * not issue. Proxying through our own route keeps the key on the server and
 * keeps the CSP `connect-src` closed to everything but our origin
 * (ARCHITECTURE-DEPLOYMENT.md section 3.1).
 *
 * It reuses `searchProductsCached`, the same call the full results page makes,
 * so the dropdown can never suggest something the results page then fails to
 * show. Fewer rows, same query.
 */

const MAX_SUGGESTIONS = 6
const MIN_QUERY = 2

async function handleGET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  // Two characters is roughly one Hebrew syllable. Below that every query
  // matches most of the catalogue, which is noise rather than a suggestion.
  if (q.length < MIN_QUERY) {
    return NextResponse.json({ results: [], engine: null })
  }

  // Typeahead fires far more often than the results page, so the ceiling is
  // higher -- but it still needs one, because a distinct `q` misses
  // `searchProductsCached` and reaches the engine (or the ILIKE fallback)
  // every time. Per IP, since this route has no session. Fails open.
  const ip = await getClientIp()
  if (!(await checkRateLimit(`search-suggest:${ip}`, 300, 300))) {
    return NextResponse.json({ results: [], engine: null, error: 'rate_limited' }, { status: 429 })
  }

  try {
    const { results, engine } = await searchProductsCached(q, MAX_SUGGESTIONS)
    return NextResponse.json(
      {
        results: results.slice(0, MAX_SUGGESTIONS).map((r) => ({
          slug: r.slug,
          name_he: r.name_he,
          // `images` is Json on the row, so it is narrowed here rather than
          // indexed blind.
          image: Array.isArray(r.images) && typeof r.images[0] === 'string' ? r.images[0] : null,
        })),
        engine,
      },
      {
        // Short private cache: the same prefix is retyped constantly while the
        // catalogue barely moves, but suggestions must not be shared between
        // users by an intermediary.
        headers: { 'Cache-Control': 'private, max-age=30' },
      },
    )
  } catch {
    // A failed suggestion must never break typing. The form still submits and
    // the full results page answers.
    return NextResponse.json({ results: [], engine: null }, { status: 200 })
  }
}

export const GET = withRequestLog('/api/search/suggest', handleGET)
