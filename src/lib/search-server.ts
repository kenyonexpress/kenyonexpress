// Server-side product search. Uses Meilisearch when MEILISEARCH_HOST is set
// (ARCHITECTURE section 10 stage 3), otherwise falls back to Postgres ILIKE via
// the Supabase client (stage 1). Both paths return the ProductCard shape.

import 'server-only'
import type { Product } from '@/components/ProductCard'
import { type SearchFilters, buildFilter, meiliConfigured, searchIndex } from '@/lib/search/client'
import { normalizeSearchQuery } from '@/lib/search/hebrew-tokenize'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { cache } from 'react'

/** How the caller wants the result set ordered. */
export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest'

export const SEARCH_SORTS: readonly SearchSort[] = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
]

export function parseSearchSort(value: string | null | undefined): SearchSort {
  return SEARCH_SORTS.includes(value as SearchSort) ? (value as SearchSort) : 'relevance'
}

export type SearchOutcome = {
  results: Product[]
  total: number
  engine: 'meilisearch' | 'database'
  /**
   * Facet counts, keyed attribute -> value -> count. Meilisearch only: the
   * database path would need one COUNT per facet per query and is the
   * degraded path already.
   */
  facets?: Record<string, Record<string, number>>
}

export type SearchParams = SearchFilters & {
  q: string
  limit?: number
  offset?: number
  sort?: SearchSort
  /** Attributes to return counts for. Ignored on the database path. */
  facets?: string[]
}

const MIN_QUERY = 2
const DEFAULT_LIMIT = 48

/**
 * The id a category slug resolves to when there is no such category.
 *
 * A uuid that cannot exist, rather than skipping the filter. Skipping it would
 * turn `?category=typo` into an unfiltered search, which shows a shopper the
 * whole catalogue under a heading naming a category they asked for.
 */
const NO_SUCH_CATEGORY = '00000000-0000-0000-0000-000000000000'

/**
 * Sort in the two dialects.
 *
 * `relevance` produces NO sort clause on either path, rather than a sort by
 * something else that looks like relevance. In Meilisearch, passing `sort`
 * moves the `sort` ranking rule ahead of the scoring that follows it, so
 * "relevance" implemented as a sort would be strictly worse than no sort at all.
 */
function meiliSort(sort: SearchSort): string[] {
  switch (sort) {
    case 'price_asc':
      return ['kenyon_price:asc']
    case 'price_desc':
      return ['kenyon_price:desc']
    case 'newest':
      return ['created_at:desc']
    default:
      return []
  }
}

type MeiliProductHit = {
  id: string
  slug: string
  name_he: string
  kenyon_price?: number | null
  full_price?: number | null
  images?: unknown
  stock_quantity?: number | null
  category_name_he?: string | null
  category_slug?: string | null
}

function hitToProduct(hit: MeiliProductHit): Product {
  return {
    id: hit.id,
    slug: hit.slug,
    name_he: hit.name_he,
    kenyon_price: hit.kenyon_price ?? null,
    full_price: hit.full_price ?? null,
    images: hit.images ?? [],
    stock_quantity: hit.stock_quantity ?? null,
    // The index stores the category flattened into two scalar fields, because
    // Meilisearch has no joins. Rebuilt into the nested shape ProductCard
    // expects so the two engines return the same object.
    category:
      hit.category_name_he && hit.category_slug
        ? { name_he: hit.category_name_he, slug: hit.category_slug }
        : null,
  }
}

async function searchMeili(params: SearchParams, q: string): Promise<SearchOutcome | null> {
  const response = await searchIndex({
    q,
    limit: params.limit ?? DEFAULT_LIMIT,
    ...(params.offset ? { offset: params.offset } : {}),
    filter: buildFilter(params),
    sort: meiliSort(params.sort ?? 'relevance'),
    ...(params.facets?.length ? { facets: params.facets } : {}),
  })
  if (!response) return null

  const results = (response.hits as MeiliProductHit[]).map(hitToProduct)
  return {
    results,
    total: response.estimatedTotalHits,
    engine: 'meilisearch',
    ...(response.facetDistribution ? { facets: response.facetDistribution } : {}),
  }
}

/**
 * The Postgres fallback.
 *
 * IT IS NOT THE SAME SEARCH AND IT DOES NOT PRETEND TO BE. There is no typo
 * tolerance, no synonym expansion and no relevance ranking here - an ILIKE
 * either contains the substring or it does not. What it does keep identical is
 * the FILTER set, so a shopper who has narrowed to "coupons in Haifa under
 * ₪200" gets that narrowing honoured either way, and the count under the
 * heading is a count of the filtered set rather than of everything.
 *
 * The one filter that genuinely differs is `city`: the engine indexes the
 * effective city (the product's, else its supplier's, resolved once by
 * toProductDocument), and PostgREST cannot express that COALESCE across a join
 * in a filter. The fallback matches `products.city` only. That is narrower,
 * never wider, so it can miss a deal - it cannot show one from the wrong city.
 */
async function searchDb(params: SearchParams, q: string): Promise<SearchOutcome> {
  const supabase = await createClient()
  let query = supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories!products_category_id_fkey(name_he, slug)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`name_he.ilike.%${q}%,description_he.ilike.%${q}%`)

  if (params.type) query = query.eq('type', params.type)

  // The engine filters on `category_slug`, which it stores flattened into the
  // document; PostgREST has only the id. Resolved HERE rather than in the route
  // so that both engines answer the same call - a caller that passes a slug
  // gets the slug honoured either way, instead of the fallback quietly
  // returning the unfiltered catalogue.
  let categoryId = params.categoryId ?? null
  if (!categoryId && params.categorySlug) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', params.categorySlug)
      .maybeSingle()
    // A slug that matches no category filters to nothing, not to everything.
    categoryId = category?.id ?? NO_SUCH_CATEGORY
  }
  if (categoryId) query = query.eq('category_id', categoryId)
  if (params.city) query = query.eq('city', params.city)
  if (typeof params.priceMin === 'number' && Number.isFinite(params.priceMin)) {
    query = query.gte('kenyon_price', params.priceMin)
  }
  if (typeof params.priceMax === 'number' && Number.isFinite(params.priceMax)) {
    query = query.lte('kenyon_price', params.priceMax)
  }
  if (params.inStockOnly) query = query.gt('stock_quantity', 0)

  switch (params.sort ?? 'relevance') {
    case 'price_asc':
      // nullsFirst: false on both directions. A product with no price is not
      // the cheapest thing in the catalogue, and it is not the most expensive
      // either; it belongs at the end of whichever order was asked for.
      query = query.order('kenyon_price', { ascending: true, nullsFirst: false })
      break
    case 'price_desc':
      query = query.order('kenyon_price', { ascending: false, nullsFirst: false })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    default:
      break
  }

  const limit = params.limit ?? DEFAULT_LIMIT
  const offset = params.offset ?? 0
  const { data, count } = await query.range(offset, offset + limit - 1)

  const results: Product[] = (data ?? []).map((p) => {
    const cat = Array.isArray(p.categories) ? (p.categories[0] ?? null) : p.categories
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      kenyon_price: p.kenyon_price,
      full_price: p.full_price,
      images: p.images,
      stock_quantity: p.stock_quantity,
      category: cat,
    }
  })
  return { results, total: count ?? results.length, engine: 'database' }
}

/**
 * One search, filters and all.
 *
 * The term is normalised for the engine (bidi marks, niqqud and gershayim
 * removed - see lib/search/hebrew-tokenize.ts) and separately sanitised for
 * PostgREST, because the two have different injection surfaces: Meilisearch
 * takes the term as a JSON value and cannot be escaped out of, while the ILIKE
 * path splices it into an `or()` expression string.
 */
export async function searchCatalogue(params: SearchParams): Promise<SearchOutcome> {
  const normalized = normalizeSearchQuery(params.q)
  if (normalized.length < MIN_QUERY) return { results: [], total: 0, engine: 'database' }

  if (meiliConfigured()) {
    const meili = await searchMeili(params, normalized)
    // Null means the engine is unreachable, slow or rejected the filter - all
    // of which fall through to the database rather than to an error page.
    if (meili) return meili
  }
  return searchDb(params, sanitizeOrTerm(normalized))
}

export async function searchProductsServer(
  query: string,
  limit = DEFAULT_LIMIT,
  productType?: 'coupon' | 'physical',
): Promise<SearchOutcome> {
  return searchCatalogue({ q: query, limit, ...(productType ? { type: productType } : {}) })
}

/**
 * Request-scoped memoisation. The result count and the grid sit behind separate
 * Suspense boundaries; without this each would run the search independently.
 *
 * POSITIONAL PRIMITIVES, NOT AN OPTIONS OBJECT. React's `cache` compares
 * arguments with Object.is, so an object literal is a fresh key on every call
 * and the memo would never hit - the count and the grid would each run their
 * own search and could disagree.
 */
export const searchProductsCached = cache(searchProductsServer)
