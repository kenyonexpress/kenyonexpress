import {
  SUGGESTION_LIMIT,
  type Suggestion,
  isSuggestibleQuery,
  normalizeSuggestionQuery,
} from '@/lib/search/suggestions'
import { createClient } from '@/lib/supabase/server'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Type-ahead for the masthead search box.
 *
 * WHY THIS IS A ROUTE AND NOT A DIRECT CALL FROM THE INPUT
 *
 * The search engine is reached with `MEILISEARCH_API_KEY`. That key is a
 * server secret: a Meilisearch key sent to the browser is readable in devtools
 * and, since Meilisearch has no per-key row filtering here, it is a key to the
 * whole index — including any document a draft product would put there. So the
 * browser talks to this same-origin route and the route talks to the engine.
 *
 * This is also why no CSP change is needed. `connect-src 'self'` already
 * permits a fetch to our own origin; opening connect-src to the search host is
 * exactly the change that would only have been necessary if the key were going
 * to the client. ARCHITECTURE-DEPLOYMENT section 3.1 declined that opening,
 * and this route is the reason it stays declined.
 */

export const runtime = 'nodejs'

type SuggestionRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  price_ils: number | null
  coupon_price_ils: number | null
  type: string | null
}

/**
 * The price the shopper would pay. A coupon is billed at `coupon_price_ils`
 * and a physical product at its shelf price; quoting the wrong one in the
 * dropdown promises a number checkout will not honour, which is the same bug
 * lib/commerce/coupon-offer.ts was written to end.
 */
function payablePrice(row: SuggestionRow): number | null {
  if (row.type === 'coupon' && row.coupon_price_ils != null) return row.coupon_price_ils
  return row.kenyon_price ?? row.price_ils ?? null
}

async function suggestFromMeili(q: string): Promise<Suggestion[] | null> {
  const host = process.env.MEILISEARCH_HOST
  const key = process.env.MEILISEARCH_API_KEY
  if (!host || !key) return null
  try {
    const res = await fetch(
      `${host.replace(/\/$/, '')}/indexes/${process.env.MEILISEARCH_INDEX ?? 'products'}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ q, limit: SUGGESTION_LIMIT }),
        cache: 'no-store',
        // A dropdown that has not answered within a second has missed its moment.
        // Falling through to Postgres beats holding the keystroke open.
        signal: AbortSignal.timeout(1000),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { hits?: SuggestionRow[] }
    return (data.hits ?? []).map((hit) => ({
      id: hit.id,
      slug: hit.slug,
      name_he: hit.name_he,
      price: payablePrice(hit),
      type: hit.type === 'coupon' || hit.type === 'physical' ? hit.type : null,
    }))
  } catch {
    return null
  }
}

async function suggestFromDb(q: string): Promise<Suggestion[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, price_ils, coupon_price_ils, type')
    .eq('status', 'active')
    .is('deleted_at', null)
    .ilike('name_he', `%${q}%`)
    .limit(SUGGESTION_LIMIT)

  return ((data ?? []) as SuggestionRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    price: payablePrice(row),
    type: row.type === 'coupon' || row.type === 'physical' ? row.type : null,
  }))
}

export async function GET(request: NextRequest) {
  const raw = normalizeSuggestionQuery(request.nextUrl.searchParams.get('q'))
  if (!isSuggestibleQuery(raw)) {
    return NextResponse.json({ query: raw, suggestions: [] })
  }

  // Same escaping the /search route uses: PostgREST reads `%`, `_` and `,` as
  // filter syntax, so an unescaped term can widen or break the filter.
  const q = sanitizeOrTerm(raw)
  if (!q) return NextResponse.json({ query: raw, suggestions: [] })

  const suggestions = (await suggestFromMeili(q)) ?? (await suggestFromDb(q))

  return NextResponse.json(
    { query: raw, suggestions },
    {
      headers: {
        // Public: this is the catalogue, identical for every visitor, and the
        // route reads nothing about the session. 30s is long enough to absorb a
        // burst of typing on a popular term and short enough that a product
        // going inactive leaves the dropdown within the minute.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  )
}
