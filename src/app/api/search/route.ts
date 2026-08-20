import { withRequestLog } from '@/lib/observability/with-request-log'
import { type SearchSort, parseSearchSort, searchCatalogue } from '@/lib/search-server'
import { MAX_QUERY_LENGTH, normalizeSearchQuery } from '@/lib/search/hebrew-tokenize'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The storefront's search endpoint: the type-ahead dropdown, the results page's
 * client-side refinements, and anything else that needs products for a term.
 *
 * It no longer runs its own query. Everything goes through `searchCatalogue`,
 * which is Meilisearch when the engine is configured and a Postgres ILIKE
 * otherwise. That matters more than it sounds: this route used to hold a SECOND
 * implementation of "search", an ILIKE that ignored the engine completely, so a
 * shopper's dropdown and the results page they landed on could answer the same
 * query differently - and did, the moment Meilisearch was switched on.
 *
 * The engine is never reached from the browser. `MEILISEARCH_API_KEY` is a
 * server secret, so a client-side fetch would either ship it in the bundle or
 * need a public key we do not issue, and the CSP connect-src is closed to
 * everything but our own origin.
 */

export type SearchResult = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  image: string | null
  category: string | null
  category_slug: string | null
}

export type SearchApiResponse = {
  query: string
  results: SearchResult[]
  total: number
  engine: 'meilisearch' | 'database'
  sort: SearchSort
  facets?: Record<string, Record<string, number>>
  error?: string
}

const MIN_QUERY = 2
const MAX_LIMIT = 48
const DEFAULT_LIMIT = 12

/** Facets the sidebar draws its counts from. Meilisearch only. */
const FACETS = ['category_slug', 'city', 'type']

/** The enum in the database. A value outside it filters to nothing, so reject it. */
const PRODUCT_TYPES = ['coupon', 'physical', 'service'] as const

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && typeof images[0] === 'string') return images[0]
  return null
}

function parseType(value: string | null): string | null {
  return PRODUCT_TYPES.includes(value as (typeof PRODUCT_TYPES)[number]) ? value : null
}

/**
 * A price bound from the query string.
 *
 * Returns null for anything that is not a finite, non-negative number, and null
 * means NO BOUND rather than zero: `?min=abc` must widen nothing and narrow
 * nothing, while a min of 0 that reached the filter would drop every product
 * whose price is NULL.
 */
function parsePrice(value: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function parseLimit(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.trunc(parsed), MAX_LIMIT)
}

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  // Normalised, not merely trimmed: a term pasted out of an RTL message carries
  // invisible bidi marks that are not whitespace and are not the word.
  // See lib/search/hebrew-tokenize.ts.
  const q = normalizeSearchQuery(searchParams.get('q') ?? '')
  const sort = parseSearchSort(searchParams.get('sort'))

  const empty = (extra: Partial<SearchApiResponse> = {}): SearchApiResponse => ({
    query: q,
    results: [],
    total: 0,
    engine: 'database',
    sort,
    ...extra,
  })

  if (q.length < MIN_QUERY) return NextResponse.json(empty())

  // Unauthenticated and uncached: every distinct `q` reaches the engine, or an
  // ILIKE over name_he + description_he with no index behind it. The ceiling is
  // per IP and deliberately generous - a shopper refining a query is nowhere
  // near it. It is checked AFTER the two-character floor so the common
  // empty-typeahead case never pays for the round trip. checkRateLimit fails
  // open by design (rate-limit.ts:22), so a limiter outage degrades to today's
  // behaviour rather than breaking search.
  const ip = await getClientIp()
  if (!(await checkRateLimit(`search:${ip}`, 120, 300))) {
    return NextResponse.json(empty({ error: 'rate_limited' }), { status: 429 })
  }

  const limit = parseLimit(searchParams.get('limit'))
  const offset = Math.max(0, Math.trunc(Number(searchParams.get('offset')) || 0))
  const priceMin = parsePrice(searchParams.get('min'))
  const priceMax = parsePrice(searchParams.get('max'))

  try {
    const outcome = await searchCatalogue({
      q,
      limit,
      offset,
      sort,
      categorySlug: searchParams.get('category')?.trim().slice(0, MAX_QUERY_LENGTH) || null,
      city: searchParams.get('city')?.trim().slice(0, MAX_QUERY_LENGTH) || null,
      type: parseType(searchParams.get('type')),
      // Swapped bounds are a slider dragged past itself, not a request for the
      // empty set. Ordering them is what the shopper meant.
      priceMin: priceMin != null && priceMax != null ? Math.min(priceMin, priceMax) : priceMin,
      priceMax: priceMin != null && priceMax != null ? Math.max(priceMin, priceMax) : priceMax,
      inStockOnly: searchParams.get('inStock') === '1',
      facets: FACETS,
    })

    const results: SearchResult[] = outcome.results.map((product) => ({
      id: product.id,
      slug: product.slug,
      name_he: product.name_he,
      kenyon_price: product.kenyon_price,
      full_price: product.full_price ?? null,
      image: firstImage(product.images),
      category: product.category?.name_he ?? null,
      category_slug: product.category?.slug ?? null,
    }))

    return NextResponse.json(
      {
        query: q,
        results,
        total: outcome.total,
        engine: outcome.engine,
        sort,
        ...(outcome.facets ? { facets: outcome.facets } : {}),
      } satisfies SearchApiResponse,
      // Short shared cache. The catalogue barely moves and the same query is
      // retyped constantly; 30 seconds of staleness on a search result is not
      // something a shopper can perceive, and this route has no session in it.
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    )
  } catch (error) {
    return NextResponse.json(
      empty({ error: error instanceof Error ? error.message : 'search failed' }),
      { status: 500 },
    )
  }
}

export const GET = withRequestLog('/api/search', handleGET)
