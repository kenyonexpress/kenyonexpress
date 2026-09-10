// Server-side product search. Uses Meilisearch when MEILISEARCH_HOST is set
// (ARCHITECTURE section 10 stage 3), otherwise Postgres full-text search via
// the `search_products` RPC (migration 171: GIN over a `simple`+unaccent
// tsvector, prefix-matched, ts_rank-ordered), and only on a database without
// that migration the original unindexed ILIKE (stage 1). All paths return the
// ProductCard shape.

import 'server-only'
import type { Product } from '@/components/ProductCard'
import { log } from '@/lib/observability/log'
import {
  type BreakerState,
  closed as breakerClosed,
  isOpen,
  recordFailure,
  recordSuccess,
} from '@/lib/search/meili-breaker'
import {
  type PendingSearchProductRow,
  type SearchProductsArgs,
  callSearchProductsRpc,
  pendingSearchRpc,
} from '@/lib/supabase/pending-search'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { cache } from 'react'

export type SearchOutcome = {
  results: Product[]
  total: number
  engine: 'meilisearch' | 'database-fts' | 'database'
}

const sanitize = sanitizeOrTerm

function meiliConfigured(): boolean {
  return Boolean(process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY)
}

type MeiliHit = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images?: unknown
  stock_quantity: number | null
  category?: { name_he: string; slug: string } | null
}

/**
 * Per-process breaker state. Module scope, so it survives between requests on a
 * warm instance and dies with the instance -- see meili-breaker.ts for why that
 * is the intended scope rather than a limitation being papered over.
 */
let breaker: BreakerState = breakerClosed

/**
 * How long a search may wait on Meilisearch before Postgres takes the query.
 *
 * Search is the slowest read here at 615ms p95 under load (docs/CAPACITY.md), so
 * this has to sit well above a healthy engine under pressure and well below the
 * point where a shopper decides the site is broken. 2s does both, and every
 * second of it is only ever paid by the first three requests after the engine
 * goes down: the breaker then answers for the next thirty.
 */
const MEILI_TIMEOUT_MS = 2_000

async function searchMeili(
  q: string,
  limit: number,
  productType?: 'coupon' | 'physical',
): Promise<SearchOutcome | null> {
  const now = Date.now()
  if (isOpen(breaker, now)) return null

  try {
    const host = (process.env.MEILISEARCH_HOST as string).replace(/\/$/, '')
    const index = process.env.MEILISEARCH_INDEX ?? 'products'
    const res = await fetch(`${host}/indexes/${index}/search`, {
      // Without this the request has no ceiling of its own: an engine that
      // accepts the connection and never answers holds the shopper until the
      // platform kills the function.
      signal: AbortSignal.timeout(MEILI_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MEILISEARCH_API_KEY}`,
      },
      // `type` is a filterable attribute (see lib/search/meili-settings.ts), so
      // the facet is applied in the engine and estimatedTotalHits stays truthful.
      body: JSON.stringify({
        q,
        limit,
        ...(productType ? { filter: `type = ${productType}` } : {}),
      }),
      // Search is request-time; do not cache across queries.
      cache: 'no-store',
    })
    if (!res.ok) {
      breaker = recordFailure(breaker, Date.now())
      return null
    }
    const data = (await res.json()) as { hits: MeiliHit[]; estimatedTotalHits?: number }
    const results: Product[] = (data.hits ?? []).map((h) => ({
      id: h.id,
      slug: h.slug,
      name_he: h.name_he,
      kenyon_price: h.kenyon_price,
      full_price: h.full_price,
      images: h.images ?? [],
      stock_quantity: h.stock_quantity,
      category: h.category ?? null,
    }))
    breaker = recordSuccess(breaker)
    return { results, total: data.estimatedTotalHits ?? results.length, engine: 'meilisearch' }
  } catch (error) {
    const previous = breaker
    breaker = recordFailure(breaker, Date.now())
    // Logged only on the transition, because the point of the breaker is that
    // the next thirty seconds of searches say nothing at all. A line per failed
    // search would bury the one line that matters.
    if (!isOpen(previous, now) && isOpen(breaker, Date.now())) {
      log.warn('search.meili_breaker_open', {
        failures: breaker.failures,
        reason: error instanceof Error ? error.name : 'unknown',
      })
    }
    return null
  }
}

/** Exported for tests: module state is otherwise unreachable between cases. */
export const __resetMeiliBreaker = (): void => {
  breaker = breakerClosed
}

/**
 * The words of the query, capped.
 *
 * `sanitizeOrTerm` has already collapsed runs of whitespace and stripped every
 * character PostgREST treats as structure, so a plain split on the space is
 * safe and each word is a literal. The cap bounds the number of `or=` groups a
 * single request can ask Postgres to AND together; eight words is far past any
 * real product name here and the longest is five.
 */
const MAX_TERMS = 8

function queryWords(q: string): string[] {
  return q.split(' ').filter(Boolean).slice(0, MAX_TERMS)
}

/**
 * EVERY WORD MUST MATCH, RATHER THAN THE WHOLE PHRASE AS ONE SUBSTRING.
 *
 * This was a single `ilike '%<the entire query>%'`, which means the customer's
 * words had to appear in the product in that order with nothing between them.
 * ALL 61 active product names are more than one word, so that is a real
 * shopper typing a real thing and being told we do not sell it:
 *
 *   query               phrase   every-word
 *   צימר צפון                0            1   <- "צימר שוויץ בצפון" exists
 *   אוזניות אלחוטיות         1            2
 *   טיפול פנים               2            2
 *   עיסוי מפנק               1            1
 *
 * Nothing gets fewer results, because a phrase that matches as a substring
 * also matches word by word.
 *
 * Each word becomes its own `.or(name, description)` group, and PostgREST ANDs
 * separate top-level filters - verified against this project rather than
 * assumed, since supabase-js appends a repeated `or=` key: one group returned
 * "צימר שוויץ בצפון" and "! צימר מאסטר", the two groups returned the first
 * alone.
 *
 * This is still the stage-1 ILIKE fallback and is not trying to be a search
 * engine: no stemming, no ranking, no typo tolerance. Meilisearch is stage 3
 * and takes over above.
 */
/** Maps a search_products row onto the ProductCard shape every path returns. */
function ftsRowToProduct(row: PendingSearchProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    kenyon_price: row.kenyon_price,
    full_price: row.full_price,
    images: row.images ?? [],
    stock_quantity: row.stock_quantity,
    category:
      row.category_name_he && row.category_slug
        ? { name_he: row.category_name_he, slug: row.category_slug }
        : null,
  }
}

/**
 * Stage 2: the `search_products` RPC. SECURITY INVOKER, so the request client
 * is the right client - RLS already scopes anon to active, non-deleted
 * products and the function can never widen that.
 *
 * Returns null in exactly one case: the function does not exist (a database
 * without migration 171), which is "use ILIKE", not an error. A real failure
 * is logged and surfaces as an empty result, the same degradation every other
 * search failure here takes.
 *
 * `total` is the row count rather than an exact overflow count: FTS results
 * are ranked, capped at `limit`, and the RPC keeps one round-trip. On this
 * catalog (80 products) the cap is rarely reached; if a paginated search page
 * ever needs the true total, add a count to the RPC rather than a second
 * query here.
 */
async function searchFts(
  q: string,
  limit: number,
  productType?: 'coupon' | 'physical',
  categorySlug?: string,
): Promise<SearchOutcome | null> {
  const supabase = await createClient()
  const args: SearchProductsArgs = { q, max_results: limit }
  if (productType) args.product_type = productType
  if (categorySlug) args.category = categorySlug

  const outcome = await callSearchProductsRpc(() =>
    supabase.rpc(pendingSearchRpc('search_products'), args as never),
  )

  if (!outcome.ok) {
    if (outcome.missing) return null
    log.error('search.fts_failed', { reason: outcome.message })
    return { results: [], total: 0, engine: 'database-fts' }
  }

  const results = outcome.rows.map(ftsRowToProduct)
  return { results, total: results.length, engine: 'database-fts' }
}

async function searchDb(
  q: string,
  limit: number,
  productType?: 'coupon' | 'physical',
): Promise<SearchOutcome> {
  const supabase = await createClient()
  let query = supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories!products_category_id_fkey(name_he, slug)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .is('deleted_at', null)

  for (const word of queryWords(q)) {
    query = query.or(`name_he.ilike.%${word}%,description_he.ilike.%${word}%`)
  }

  // Same coupon/physical facet the archives expose, applied in the query so the
  // count stays truthful rather than filtering an already-capped page.
  if (productType) query = query.eq('type', productType)

  const { data, count } = await query.limit(limit)

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

export async function searchProductsServer(
  query: string,
  limit = 48,
  productType?: 'coupon' | 'physical',
): Promise<SearchOutcome> {
  const q = sanitize(query)
  if (q.length < 2) return { results: [], total: 0, engine: 'database' }

  // scripts/setup-meilisearch.mjs declares `type` filterable, so the facet is
  // honoured by the engine. If the index has not been configured the filtered
  // request 400s, searchMeili returns null, and the database path takes over —
  // which is correct behaviour, not a silent unfiltered result set.
  if (meiliConfigured()) {
    const meili = await searchMeili(q, limit, productType)
    if (meili) return meili
  }
  // Postgres FTS (migration 171). Null means the RPC does not exist on this
  // database, so the stage-1 ILIKE below still carries local/preview setups.
  const fts = await searchFts(q, limit, productType)
  if (fts) return fts
  return searchDb(q, limit, productType)
}

/**
 * Request-scoped memoisation. The result count and the grid sit behind separate
 * Suspense boundaries; without this each would run the search independently.
 */
export const searchProductsCached = cache(searchProductsServer)
