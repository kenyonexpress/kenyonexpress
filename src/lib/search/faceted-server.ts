import 'server-only'

import { getCategoryIndex } from '@/lib/category-page'
import { categorySubtree } from '@/lib/category-tree'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { log } from '@/lib/observability/log'
import {
  FACET_ATTRIBUTES,
  type FacetDistribution,
  type FacetedSearchParams,
  LEGACY_FACET_ATTRIBUTES,
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
import { localesParam } from '@/lib/search/query-locale'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { cache } from 'react'

/**
 * Faceted search, the engine half. The API route (`/api/search/facets`) and
 * the results page both call this, so a facet count shown on the page is the
 * same count the API would report for the same URL, and neither can drift
 * from the other.
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

export type FacetHit = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  image: string | null
  /** The raw column, for a card that renders the gallery shape itself. */
  images: unknown
  stock_quantity: number | null
  category: string | null
  category_slug: string | null
  brand: string | null
  type: string
  in_stock: boolean
}

export type FacetsResponse = {
  query: string
  results: FacetHit[]
  total: number
  facets: FacetDistribution
  engine: 'meilisearch' | 'database'
}

export type FacetedOutcome = FacetsResponse | { error: string }

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
    images: doc.images,
    stock_quantity: doc.stock_quantity,
    category: doc.category_name_he,
    category_slug: doc.category_slug,
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

/**
 * Null on any failure, so the database path takes over rather than a 500.
 *
 * Two attempts when the request does not itself depend on `discount_bp`: an
 * index built before that field was filterable refuses the full facet list
 * with a 400, and answering every search from Postgres until the next reindex
 * would be a worse outcome than one facet missing from the sidebar.
 */
async function searchMeiliFaceted(params: FacetedSearchParams): Promise<FacetsResponse | null> {
  const needsDiscount = params.discountMin !== undefined || params.sort === 'discount_desc'
  const attempts: readonly (readonly string[])[] = needsDiscount
    ? [FACET_ATTRIBUTES]
    : [FACET_ATTRIBUTES, LEGACY_FACET_ATTRIBUTES]
  try {
    const host = (process.env.MEILISEARCH_HOST as string).replace(/\/$/, '')
    const sort = buildMeiliSort(params.sort)
    for (const facets of attempts) {
      const res = await fetchWithTimeout(`${host}/indexes/${PRODUCTS_INDEX}/search`, {
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
          facets: [...facets],
          ...(sort ? { sort } : {}),
          ...localesParam(params.q),
        }),
        cache: 'no-store',
      })
      if (!res.ok) continue
      const data = (await res.json()) as MeiliFacetResponse
      const hits = data.hits ?? []
      return {
        query: params.q,
        results: hits.map(docToHit),
        total: data.estimatedTotalHits ?? hits.length,
        facets: data.facetDistribution ?? {},
        engine: 'meilisearch',
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Widens `category` to the category and everything under it, so a parent in
 * the tree facet shows its children's products. The index is the cached
 * catalogue read the breadcrumbs use. A slug the index does not know, or an
 * index that cannot be read, leaves the filter on the one slug: narrower than
 * intended, never wider.
 */
async function withCategorySubtree(params: FacetedSearchParams): Promise<FacetedSearchParams> {
  if (!params.category) return params
  try {
    const index = await getCategoryIndex()
    const node = index.find((entry) => entry.slug === params.category)
    if (!node) return params
    return { ...params, categorySlugs: categorySubtree(index, node.id).map((entry) => entry.slug) }
  } catch (error) {
    log.warn('search.category_subtree_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return params
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

async function searchDbFaceted(params: FacetedSearchParams): Promise<FacetedOutcome> {
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

/**
 * Runs one faceted search. The query is sanitised here, once, so neither
 * caller can forget it. Emits one `search.executed` event per run: engine,
 * hit count, latency and which facets were active -- the operational half of
 * search analytics (`search_events` is the catalogue half, and records terms
 * only on the results page, never here).
 */
export async function facetedSearch(input: FacetedSearchParams): Promise<FacetedOutcome> {
  const params = await withCategorySubtree({ ...input, q: sanitizeOrTerm(input.q) })
  const started = Date.now()

  let outcome: FacetedOutcome | null = null
  if (meiliConfigured()) outcome = await searchMeiliFaceted(params)
  if (!outcome) outcome = await searchDbFaceted(params)

  if (!('error' in outcome)) {
    log.info('search.executed', {
      engine: outcome.engine,
      hits: outcome.total,
      ms: Date.now() - started,
      query_length: params.q.length,
      facets: activeFacetNames(params),
    })
  }
  return outcome
}

/** Which facets narrowed the query, by name; for the log line, not the UI. */
function activeFacetNames(params: FacetedSearchParams): string[] {
  const names: string[] = []
  if (params.type) names.push('type')
  if (params.category) names.push('category')
  if (params.supplier) names.push('supplier')
  if (params.discountMin !== undefined) names.push('discount')
  if (params.city) names.push('city')
  if (params.brand) names.push('brand')
  if (params.tag) names.push('tag')
  if (params.inStock !== undefined) names.push('in_stock')
  if (params.priceMin !== undefined || params.priceMax !== undefined) names.push('price')
  return names
}

/**
 * Request-scoped memoisation for the results page: the count, the grid and
 * the facet navigation sit behind separate Suspense boundaries and share one
 * search. Keyed by the serialised params so two different filter sets on one
 * render (there are none today) would not collide.
 */
const facetedSearchByKey = cache(async (key: string): Promise<FacetedOutcome> => {
  const parsed = parseFacetedParams(new URLSearchParams(key))
  if (!parsed.ok) return { error: parsed.error }
  return facetedSearch(parsed.params)
})

/**
 * The page's entry point: takes the URL's own search params and answers the
 * same way the API would for the same URL. Invalid params are the API's 400,
 * here an `error` outcome the page renders as "no results".
 */
export function facetedSearchCached(searchParams: URLSearchParams): Promise<FacetedOutcome> {
  const key = new URLSearchParams(searchParams)
  key.sort()
  return facetedSearchByKey(key.toString())
}
