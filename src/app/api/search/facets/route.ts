import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  FACET_ATTRIBUTES,
  type FacetDistribution,
  type FacetedSearchParams,
  applyFacetFilters,
  buildMeiliFilters,
  buildMeiliSort,
  computeFacetDistribution,
  parseFacetedParams,
  sortDocs,
} from '@/lib/search/faceted'
import {
  PRODUCTS_INDEX,
  type ProductDocument,
  toProductDocument,
} from '@/lib/search/meili-settings'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Faceted search over the product catalogue.
 *
 * Two engines, one contract (ARCHITECTURE-SEARCH-DISCOVERY.md section 0):
 * Meilisearch answers when MEILISEARCH_HOST is configured, with filters and
 * facetDistribution computed in the engine; otherwise a Postgres read feeds
 * the same filter and counting rules from lib/search/faceted.ts, so the
 * response shape is identical and a caller cannot tell which engine ran.
 *
 * Coupons are not a separate index: `type=coupon` is a facet of the products
 * index, the same reading the cart and the archives use.
 */

type FacetHit = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  image: string | null
  category: string | null
  brand: string | null
  type: string
  in_stock: boolean
}

type FacetsResponse = {
  query: string
  results: FacetHit[]
  total: number
  facets: FacetDistribution
  engine: 'meilisearch' | 'database'
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && typeof images[0] === 'string') return images[0] as string
  return null
}

function docToHit(doc: ProductDocument): FacetHit {
  return {
    id: doc.id,
    slug: doc.slug,
    name_he: doc.name_he,
    kenyon_price: doc.kenyon_price,
    full_price: doc.full_price,
    image: firstImage(doc.images),
    category: doc.category_name_he,
    brand: doc.brand,
    type: doc.type,
    in_stock: doc.in_stock,
  }
}

function meiliConfigured(): boolean {
  return Boolean(process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY)
}

type MeiliFacetResponse = {
  hits: ProductDocument[]
  estimatedTotalHits?: number
  facetDistribution?: FacetDistribution
}

/** Null on any failure, so the database path takes over rather than a 500. */
async function searchMeiliFaceted(params: FacetedSearchParams): Promise<FacetsResponse | null> {
  try {
    const host = (process.env.MEILISEARCH_HOST as string).replace(/\/$/, '')
    const sort = buildMeiliSort(params.sort)
    const res = await fetch(`${host}/indexes/${PRODUCTS_INDEX}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MEILISEARCH_API_KEY}`,
      },
      body: JSON.stringify({
        q: params.q,
        limit: params.limit,
        offset: params.offset,
        filter: buildMeiliFilters(params),
        facets: [...FACET_ATTRIBUTES],
        ...(sort ? { sort } : {}),
      }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as MeiliFacetResponse
    const hits = data.hits ?? []
    return {
      query: params.q,
      results: hits.map(docToHit),
      total: data.estimatedTotalHits ?? hits.length,
      facets: data.facetDistribution ?? {},
      engine: 'meilisearch',
    }
  } catch {
    return null
  }
}

/**
 * The fallback reads a bounded window of matching rows and filters, counts
 * and sorts them with the shared helpers. The bound keeps the route cheap on
 * a catalogue of 80; if the catalogue ever outgrows it, the honest fix is
 * turning Meilisearch on, not raising the window.
 *
 * Known degradation, deliberate: `city` here is the product's own column
 * without the supplier fallback the indexer resolves, because that COALESCE
 * needs the admin-only suppliers table and this is an anon route.
 */
const FALLBACK_WINDOW = 500

async function searchDbFaceted(
  params: FacetedSearchParams,
): Promise<FacetsResponse | { error: string }> {
  const supabase = await createClient()
  let query = supabase
    .from('products')
    .select(
      `id, slug, name_he, name_en, brand, short_description_he, description_he, sku,
       type, is_coupon_enabled, kenyon_price, full_price, images, stock_quantity,
       category_id, supplier_id, city, tags, created_at,
       categories!products_category_id_fkey(name_he, slug)`,
    )
    .eq('status', 'active')
    .is('deleted_at', null)

  // Every word must match, the same rule search-server.ts documents: a phrase
  // that matches as one substring also matches word by word, so nothing is
  // lost, and multi-word queries stop demanding exact adjacency.
  for (const word of params.q.split(' ').filter(Boolean).slice(0, 8)) {
    query = query.or(`name_he.ilike.%${word}%,description_he.ilike.%${word}%`)
  }

  const { data, error } = await query.limit(FALLBACK_WINDOW)
  if (error) {
    // The upstream message never reaches the client (see /api/search).
    log.error('search.facets_query_failed', { reason: error.message })
    return { error: 'search_failed' }
  }

  const docs = (data ?? []).map((row) => toProductDocument(row))
  const filtered = applyFacetFilters(docs, params)
  const ordered = sortDocs(filtered, params.sort)
  const page = ordered.slice(params.offset, params.offset + params.limit)

  return {
    query: params.q,
    results: page.map(docToHit),
    total: filtered.length,
    facets: computeFacetDistribution(filtered),
    engine: 'database',
  }
}

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const parsed = parseFacetedParams(searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ results: [], facets: {}, error: parsed.error }, { status: 400 })
  }
  const params = { ...parsed.params, q: sanitizeOrTerm(parsed.params.q) }

  // Separate bucket from /api/search: this route carries filters and facet
  // counting, so its honest ceiling is lower than the type-ahead-adjacent one.
  const ip = await getClientIp()
  if (!(await checkRateLimit(`search-facets:${ip}`, 60, 300))) {
    return NextResponse.json(
      { query: params.q, results: [], facets: {}, error: 'rate_limited' },
      { status: 429 },
    )
  }

  if (meiliConfigured()) {
    const meili = await searchMeiliFaceted(params)
    if (meili) {
      return NextResponse.json(meili, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      })
    }
  }

  const outcome = await searchDbFaceted(params)
  if ('error' in outcome) {
    return NextResponse.json(
      { query: params.q, results: [], facets: {}, error: outcome.error },
      { status: 500 },
    )
  }
  return NextResponse.json(outcome, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}

export const GET = withRequestLog('/api/search/facets', handleGET)
