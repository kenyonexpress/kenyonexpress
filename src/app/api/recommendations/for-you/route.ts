import type { Product } from '@/components/ProductCard'
import { CacheControl } from '@/lib/cache/http'
import { POSTHOG_ID_COOKIE } from '@/lib/observability/posthog'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { loadForYou } from '@/lib/recommendations/for-you'
import { MAX_SEEDS } from '@/lib/recommendations/rules'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The personalised home row's data (STEP 57). Unauthenticated, per visitor,
 * never shared-cached.
 *
 * IDENTITY COMES FROM THE COOKIE, NOT THE QUERY. `ke_ph_id` is the PostHog
 * distinct id `observability/posthog.ts` mirrors for the server; reading it
 * here means a caller can only ever ask about the browser making the request.
 * A `?distinct_id=` parameter would let anyone fetch a row shaped by someone
 * else's browsing. The id is length-capped and used for nothing but the HogQL
 * bind value, as in `server/analytics/track.ts`.
 *
 * SEEDS ARE VISITOR-CONTROLLED. `?seed=` carries the browser's recent view
 * list; `loadForYou` UUID-filters and caps it before any query, and this
 * handler refuses an over-long list outright rather than trimming it, so a
 * client sending 400 ids learns it is wrong.
 *
 * THE RESPONSE IS CARDS ONLY. Never the history, never the ids it was built
 * from: the row says "you might like these", not "here is what you looked at".
 */
const MAX_ID_LENGTH = 128

function cardOf(p: Product): Product {
  return {
    id: p.id,
    slug: p.slug,
    name_he: p.name_he,
    kenyon_price: p.kenyon_price,
    full_price: p.full_price ?? null,
    images: p.images,
    stock_quantity: p.stock_quantity,
    category: p.category ?? null,
  }
}

async function handleGET(request: NextRequest) {
  const ip = await getClientIp()
  const decision = await rateLimit('recommendations', ip)
  if (!decision.allowed) {
    const headers = new Headers(rateLimitHeaders(decision))
    headers.set('Cache-Control', CacheControl.private)
    return NextResponse.json({ products: [], error: 'rate_limited' }, { status: 429, headers })
  }

  const { searchParams } = new URL(request.url)
  const rawSeeds = (searchParams.get('seed') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (rawSeeds.length > MAX_SEEDS * 2) {
    return NextResponse.json(
      { products: [], error: 'too_many_seeds' },
      { status: 400, headers: { 'Cache-Control': CacheControl.private } },
    )
  }

  const cookie = request.cookies.get(POSTHOG_ID_COOKIE)?.value?.trim() ?? ''
  const distinctId = cookie.length > 0 && cookie.length <= MAX_ID_LENGTH ? cookie : null

  const products = await loadForYou({ distinctId, seedIds: rawSeeds })
  return NextResponse.json(
    { products: products.map(cardOf) },
    { headers: { 'Cache-Control': CacheControl.private } },
  )
}

export const GET = withRequestLog('/api/recommendations/for-you', handleGET)
