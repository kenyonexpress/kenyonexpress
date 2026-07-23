// Server-side product search. Uses Meilisearch when MEILISEARCH_HOST is set
// (ARCHITECTURE section 10 stage 3), otherwise falls back to Postgres ILIKE via
// the Supabase client (stage 1). Both paths return the ProductCard shape.

import 'server-only'
import type { Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'

export type SearchOutcome = {
  results: Product[]
  total: number
  engine: 'meilisearch' | 'database'
}

function sanitize(term: string): string {
  return term
    .replace(/[%,()*]/g, ' ')
    .trim()
    .slice(0, 80)
}

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

async function searchMeili(q: string, limit: number): Promise<SearchOutcome | null> {
  try {
    const host = (process.env.MEILISEARCH_HOST as string).replace(/\/$/, '')
    const index = process.env.MEILISEARCH_INDEX ?? 'products'
    const res = await fetch(`${host}/indexes/${index}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MEILISEARCH_API_KEY}`,
      },
      body: JSON.stringify({ q, limit }),
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

async function searchDb(q: string, limit: number): Promise<SearchOutcome> {
  const supabase = await createClient()
  const { data, count } = await supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories(name_he, slug)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`name_he.ilike.%${q}%,description_he.ilike.%${q}%`)
    .limit(limit)

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

export async function searchProductsServer(query: string, limit = 48): Promise<SearchOutcome> {
  const q = sanitize(query)
  if (q.length < 2) return { results: [], total: 0, engine: 'database' }

  if (meiliConfigured()) {
    const meili = await searchMeili(q, limit)
    if (meili) return meili
  }
  return searchDb(q, limit)
}
