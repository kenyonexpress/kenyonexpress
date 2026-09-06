import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { callSearchProductsRpc, pendingSearchRpc } from '@/lib/supabase/pending-search'
import type { SearchProductsArgs } from '@/lib/supabase/pending-search'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { type NextRequest, NextResponse } from 'next/server'

// Postgres full-text search via the `search_products` RPC (migration 171:
// GIN over a `simple`+unaccent tsvector, prefix-matched, ts_rank-ordered,
// SECURITY INVOKER so anon RLS scopes the rows). A database without 171
// falls back to the original stage-1 ILIKE below. Returns a compact product
// list for the search dropdown / results page.

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
const sanitize = sanitizeOrTerm

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = sanitize(searchParams.get('q') ?? '')
  const category = searchParams.get('category')?.trim() || null
  const limit = Math.min(Number(searchParams.get('limit')) || 12, 40)

  if (q.length < 2) return NextResponse.json({ query: q, results: [] })

  // Unauthenticated and uncached: every distinct `q` is an ILIKE over
  // name_he + description_he with no index behind it, so this is the cheapest
  // way for a stranger to make the database work. The ceiling is per IP and
  // deliberately generous -- a shopper refining a query is nowhere near it.
  // The check itself costs one round-trip, and it is placed after the
  // two-character floor so the common empty-typeahead case never pays for it.
  // checkRateLimit fails open by design (rate-limit.ts:22), so a limiter
  // outage degrades to today's behaviour rather than breaking search.
  const ip = await getClientIp()
  if (!(await checkRateLimit(`search:${ip}`, 120, 300))) {
    return NextResponse.json({ query: q, results: [], error: 'rate_limited' }, { status: 429 })
  }

  const supabase = await createClient()

  // FTS path. The RPC folds the category filter in as a join on the slug: a
  // slug that is not a category matches no join row and narrows to nothing,
  // the same contract the fallback's explicit lookup keeps.
  const args: SearchProductsArgs = { q, max_results: limit }
  if (category) args.category = category
  const fts = await callSearchProductsRpc(() =>
    supabase.rpc(pendingSearchRpc('search_products'), args as never),
  )
  if (fts.ok) {
    const results: SearchResult[] = fts.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name_he: row.name_he,
      kenyon_price: row.kenyon_price,
      full_price: row.full_price,
      image: firstImage(row.images),
      category: row.category_name_he,
    }))
    return NextResponse.json(
      { query: q, results },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    )
  }
  if (!fts.missing) {
    // Same degradation contract as the ILIKE path below: log the reason,
    // answer with a code, never the upstream message.
    log.error('search.fts_failed', { reason: fts.message })
    return NextResponse.json({ query: q, results: [], error: 'search_failed' }, { status: 500 })
  }

  // Missing RPC: a database without migration 171. Stage-1 ILIKE fallback.
  let query = supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, categories!products_category_id_fkey(name_he, slug)',
    )
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`name_he.ilike.%${q}%,description_he.ilike.%${q}%`)
    .limit(limit)

  if (category) {
    // A FAILED LOOKUP HERE IS NOT "NO SUCH CATEGORY". Discarded, the error left
    // `cat` null, the filter was silently dropped, and the shopper who asked to
    // search inside one category got results from ALL of them - a WRONG answer
    // presented as a correct one, which is worse than the empty list every
    // other failure in this route degrades to. A slug that genuinely does not
    // exist still returns no rows and no error, and still narrows to nothing.
    const { data: cat, error: catError } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', category)
      .maybeSingle()
    if (catError) {
      log.error('search.category_lookup_failed', { reason: catError.message })
      return NextResponse.json({ query: q, results: [], error: 'search_failed' }, { status: 500 })
    }
    // No row: the slug is not a category, so nothing can match inside it.
    if (!cat?.id) return NextResponse.json({ query: q, results: [] })
    query = query.eq('category_id', cat.id)
  }

  const { data, error } = await query
  if (error) {
    // THE UPSTREAM MESSAGE DOES NOT GO TO THE CLIENT.
    //
    // This line used to return `error.message`, and every other route in
    // src/app/api logs the message and answers with a code instead. Measured on
    // 2026-08-19: `/api/search?q=' or 1=1--` is refused by the WAF sitting in
    // front of the database, whose reply is a full HTML challenge page, and this
    // endpoint put that page inside the JSON body of a public GET. Anyone could
    // ask a search box what infrastructure is behind it.
    //
    // The status stays 500 and the shape stays the same, so the dropdown and
    // the results page keep degrading to "no results" exactly as before.
    log.error('search.query_failed', { reason: error.message })
    return NextResponse.json({ query: q, results: [], error: 'search_failed' }, { status: 500 })
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

export const GET = withRequestLog('/api/search', handleGET)
