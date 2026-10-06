import { getShopProducts } from '@/lib/category-page'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { parseProductsFeedQuery, shopHasMore } from '@/lib/products-feed'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { attachRatings } from '@/server/queries/reviews'
import { type NextRequest, NextResponse } from 'next/server'

async function handleGET(request: NextRequest) {
  const query = parseProductsFeedQuery(request.nextUrl.searchParams)

  const ip = await getClientIp()
  const decision = await rateLimit('products-list', ip)
  if (!decision.allowed) {
    return NextResponse.json(
      { products: [], page: query.page, total_count: 0, has_more: false, error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  try {
    const { items, total } = await getShopProducts({
      sort: query.sort,
      page: query.page,
      limit: query.limit,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      productType: query.productType,
    })
    const products = await attachRatings(items)
    return NextResponse.json(
      {
        products,
        page: query.page,
        limit: query.limit,
        total_count: total,
        has_more: shopHasMore(query.page, query.limit, total),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    )
  } catch (error) {
    log.error('products.list_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json(
      { products: [], page: query.page, total_count: 0, has_more: false, error: 'list_failed' },
      { status: 500 },
    )
  }
}

export const GET = withRequestLog('/api/products', handleGET)
