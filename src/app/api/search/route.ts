import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

// Stage 1 search (ARCHITECTURE section 10): Postgres ILIKE over name_he +
// description_he. Moves to Meilisearch past ~1,000 products. Returns a compact
// product list for the search dropdown / results page.

export const runtime = 'nodejs'

export type SearchResult = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  image: string | null
  category: string | null
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && typeof images[0] === 'string') return images[0] as string
  return null
}

// Escape PostgREST ILIKE wildcards / commas so user input can't alter the filter.
function sanitize(term: string): string {
  return term
    .replace(/[%,()*]/g, ' ')
    .trim()
    .slice(0, 80)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = sanitize(searchParams.get('q') ?? '')
  const category = searchParams.get('category')?.trim() || null
  const limit = Math.min(Number(searchParams.get('limit')) || 12, 40)

  if (q.length < 2) return NextResponse.json({ query: q, results: [] })

  const supabase = await createClient()
  let query = supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, full_price, images, categories(name_he, slug)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`name_he.ilike.%${q}%,description_he.ilike.%${q}%`)
    .limit(limit)

  if (category) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', category)
      .maybeSingle()
    if (cat?.id) query = query.eq('category_id', cat.id)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ query: q, results: [], error: error.message }, { status: 500 })
  }

  const results: SearchResult[] = (data ?? []).map((p) => {
    const c = Array.isArray(p.categories) ? p.categories[0] : p.categories
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      kenyon_price: p.kenyon_price,
      full_price: p.full_price,
      image: firstImage(p.images),
      category: c?.name_he ?? null,
    }
  })

  return NextResponse.json(
    { query: q, results },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  )
}
