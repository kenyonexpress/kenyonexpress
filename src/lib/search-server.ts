// Server-side product search. Uses Meilisearch when MEILISEARCH_HOST is set
// (ARCHITECTURE section 10 stage 3), otherwise Postgres full-text search via
// the `search_products` RPC (migration 171: GIN over a `simple`+unaccent
// tsvector, prefix-matched, ts_rank-ordered), and only on a database without
// that migration the original unindexed ILIKE (stage 1). All paths return the
// ProductCard shape.

import { log } from '@/lib/observability/log'
import {
  type PendingSearchProductRow,
  type SearchProductsArgs,
  callSearchProductsRpc,
  pendingSearchRpc,
} from '@/lib/supabase/pending-search'
import 'server-only'
import type { Product } from '@/components/ProductCard'
import { expandQueryWord } from '@/lib/search/db-expansion'
import { escapeMeiliFilterValue } from '@/lib/search/faceted'
import { meiliSearch } from '@/lib/search/meili-request'
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
  city?: string | null
}

async function searchMeili(
  q: string,
  limit: number,
  productType?: 'coupon' | 'physical',
  categorySlug?: string,
): Promise<SearchOutcome | null> {
  const index = process.env.MEILISEARCH_INDEX ?? 'products'
  const filter: string[] = []
  if (productType) filter.push(`type = ${productType}`)
  if (categorySlug) filter.push(`category_slug = ${escapeMeiliFilterValue(categorySlug)}`)
  const data = await meiliSearch<{ hits: MeiliHit[]; estimatedTotalHits?: number }>(
    `/indexes/${index}/search`,
    'POST',
    {
      q,
      limit,
      // `type` is a filterable attribute (see lib/search/meili-settings.ts), so
      // the facet is applied in the engine and estimatedTotalHits stays truthful.
      // The category slug goes through the same quoting the faceted route uses,
      // so it can only ever be a value in the expression, never a second clause.
      ...(filter.length ? { filter } : {}),
    },
  )

  if (!data) return null

  const results: Product[] = (data.hits ?? []).map((h) => ({
    id: h.id,
    slug: h.slug,
    name_he: h.name_he,
    kenyon_price: h.kenyon_price,
    full_price: h.full_price,
    images: h.images ?? [],
    stock_quantity: h.stock_quantity,
    city: h.city ?? null,
    category: h.category ?? null,
  }))
  return { results, total: data.estimatedTotalHits ?? results.length, engine: 'meilisearch' }
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
 * SYNONYMS APPLY HERE NOW, NOT ONLY IN MEILISEARCH. `hebrew-synonyms.ts` was
 * imported by `meili-settings.ts` and by tests, and by nothing else - so the
 * golden query set was green in CI against an engine that is not configured
 * (`MEILISEARCH_HOST` appears nowhere outside `.env.example`) while every real
 * shopper hit this function, which had no synonyms and no morphology.
 * `expandQueryWord` closes that: same declared groups, adapted to substring
 * matching. Measured against production, `המסעדה` went from 0 rows to the
 * restaurant group.
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
  categorySlug?: string,
): Promise<SearchOutcome> {
  const supabase = await createClient()
  // `!inner` only when a category is asked for: the plain (left) embed keeps
  // uncategorised products in an unscoped search, while the scoped one has to
  // drop rows whose category is not the one named, and a left embed cannot.
  const embed = categorySlug
    ? 'categories!products_category_id_fkey!inner(name_he, slug)'
    : 'categories!products_category_id_fkey(name_he, slug)'
  let query = supabase
    .from('products')
    .select(`id, slug, name_he, kenyon_price, full_price, images, stock_quantity, city, ${embed}`, {
      count: 'exact',
    })
    .eq('status', 'active')
    .is('deleted_at', null)

  if (categorySlug) query = query.eq('categories.slug', categorySlug)

  // Each word becomes ONE or= group listing every spelling it can match, and
  // PostgREST ANDs the groups. So "עיסוי זוגי" still requires both concepts,
  // but either may appear as any member of its synonym group.
  //
  // expandQueryWord always returns the typed word first, so this can only ever
  // widen a result set, never narrow one. See db-expansion.ts.
  // CITY IS SEARCHED HERE BECAUSE IT IS SEARCHED IN THE ENGINE WE DO NOT RUN.
  //
  // `meili-settings.ts` puts `city` in SEARCHABLE_ATTRIBUTES above the
  // descriptions, and says why in a comment: a place-and-thing query is a real
  // shopper shape and a city hit means more than the same word buried in
  // marketing copy. This path read `name_he` and `description_he` only, so the
  // signal the engine ranks second could not be matched at all.
  //
  // Measured 2026-09-08 by running the golden set through this path's own
  // semantics: eight of the nine canonical journeys passed and
  // `קפה תל אביב -> coffee-tlv` returned nothing. The deal is named
  // "בית קפה — מאפה ושתייה" and sits in תל אביב, so `קפה` matched the name and
  // neither `תל` nor `אביב` could match anywhere. The words are ANDed, so the
  // shopper got zero results. golden-queries-db.test.ts holds that journey now.
  // WHY THREE COLUMNS AND NOT THE NINE MEILISEARCH INDEXES.
  //
  // `meili-settings.ts` declares nine searchable attributes: name_he, name_en,
  // brand, category_name_he, city, tags, supplier_name, short_description_he,
  // description_he. This path reads three. That gap was examined on 2026-09-08
  // rather than left implicit, and it is smaller than the count suggests.
  //
  //   short_description_he  NOT NEEDED, and this was the hypothesis that
  //     failed. The golden fixture puts "אימונים ללא הגבלה" there, so a shopper
  //     typing אימונים looked like it would miss - and it does not, because
  //     `expandQueryWord` maps אימונים onto כושר through the shipped synonym
  //     map and כושר is in the name. The expansion is doing the work the extra
  //     column would.
  //   name_en, brand         Plain columns, cheap to add, and NO golden journey
  //     fails without them. Pass 44 added `city` because a canonical journey
  //     returned zero; adding a column on a hunch is the opposite of that, and
  //     "FitCenter finds nothing" is a query nobody has said a shopper types.
  //   tags                   An array column. ILIKE does not apply to it the
  //     way it applies to text, so this is a different query shape, not a
  //     longer clause list.
  //   category_name_he, supplier_name
  //     Live on joined tables. PostgREST `or=` across an embedded resource
  //     changes what the whole query returns, so this is a rewrite rather than
  //     an addition.
  //
  // The column list is pinned by search-server.test.ts, including a check that
  // no PostgREST syntax escapes a clause, so a fourth column is a deliberate
  // edit in two places rather than a quiet widening.
  for (const word of queryWords(q)) {
    const clauses = expandQueryWord(word).flatMap((spelling) => [
      `name_he.ilike.%${spelling}%`,
      `description_he.ilike.%${spelling}%`,
      `city.ilike.%${spelling}%`,
    ])
    if (clauses.length > 0) query = query.or(clauses.join(','))
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
      city: p.city ?? null,
      category: cat,
    }
  })
  return { results, total: count ?? results.length, engine: 'database' }
}

/**
 * `categorySlug` scopes the search to one archive. The listing page's
 * autocomplete passes it so that typing inside /category/spa cannot suggest a
 * refrigerator; every engine applies it in the query (a Meilisearch filter,
 * the RPC's `category` argument, an inner-join equality on the ILIKE path), so
 * the count is the count of the scoped result and not of a filtered page.
 */
export async function searchProductsServer(
  query: string,
  limit = 48,
  productType?: 'coupon' | 'physical',
  categorySlug?: string,
): Promise<SearchOutcome> {
  const q = sanitize(query)
  if (q.length < 2) return { results: [], total: 0, engine: 'database' }

  // scripts/setup-meilisearch.mjs declares `type` filterable, so the facet is
  // honoured by the engine. If the index has not been configured the filtered
  // request 400s, searchMeili returns null, and the database path takes over —
  // which is correct behaviour, not a silent unfiltered result set.
  if (meiliConfigured()) {
    const meili = await searchMeili(q, limit, productType, categorySlug)
    if (meili) return meili
  }
  // Postgres FTS (migration 171). Null means the RPC does not exist on this
  // database, so the stage-1 ILIKE below still carries local/preview setups.
  const fts = await searchFts(q, limit, productType, categorySlug)
  if (fts) return fts
  return searchDb(q, limit, productType, categorySlug)
}

/**
 * Request-scoped memoisation. The result count and the grid sit behind separate
 * Suspense boundaries; without this each would run the search independently.
 */
export const searchProductsCached = cache(searchProductsServer)
