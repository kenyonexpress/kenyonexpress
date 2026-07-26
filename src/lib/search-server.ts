// Server-side product search. Uses Meilisearch when MEILISEARCH_HOST is set
// (ARCHITECTURE section 10 stage 3), otherwise falls back to Postgres ILIKE via
// the Supabase client (stage 1). Both paths return the ProductCard shape.

import 'server-only'
import type { Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { cache } from 'react'

export type SearchOutcome = {
  results: Product[]
  total: number
  engine: 'meilisearch' | 'database'
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

async function searchMeili(
  q: string,
  limit: number,
  productType?: 'coupon' | 'physical',
): Promise<SearchOutcome | null> {
  try {
    const host = (process.env.MEILISEARCH_HOST as string).replace(/\/$/, '')
    const index = process.env.MEILISEARCH_INDEX ?? 'products'
    const res = await fetch(`${host}/indexes/${index}/search`, {
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
    if (!res.ok) return null
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
    return { results, total: data.estimatedTotalHits ?? results.length, engine: 'meilisearch' }
  } catch {
    return null
  }
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
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories(name_he, slug)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`name_he.ilike.%${q}%,description_he.ilike.%${q}%`)

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
  return searchDb(q, limit, productType)
}

/**
 * Request-scoped memoisation. The result count and the grid sit behind separate
 * Suspense boundaries; without this each would run the search independently.
 */
export const searchProductsCached = cache(searchProductsServer)
