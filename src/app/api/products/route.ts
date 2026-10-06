import { CacheControl } from '@/lib/cache/http'
import { getShopProducts } from '@/lib/category-page'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { parseProductsListQuery } from '@/lib/products/list-query'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Shop catalogue pages for the infinite-scroll grid.
 *
 * `GET /api/products?sort=price_asc|price_desc|newest&page=N&limit=20`
 *
 * The same `getShopProducts` read as `/products`, including `min` / `max` /
 * `type`, so a page the shopper filtered and then sorted does not widen
 * again when they scroll. `limit` is capped at 20. A larger value is not a
 * 400: it is the cap, so a forged query cannot ask for the whole table.
 */

type WireCategory = { name_he: string; slug: string }

function toWire(row: {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  categories: WireCategory | WireCategory[] | null
}) {
  const joined = row.categories
  const categories = Array.isArray(joined) ? joined : joined ? [joined] : []
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    kenyon_price: row.kenyon_price,
    full_price: row.full_price,
    images: row.images,
    stock_quantity: row.stock_quantity,
    categories: categories.map((cat) => ({ name_he: cat.name_he, slug: cat.slug })),
  }
}

async function handleGET(request: NextRequest) {
  const parsed = parseProductsListQuery(new URL(request.url).searchParams)

  const ip = await getClientIp()
  const decision = await rateLimit('products-list', ip)
  if (!decision.allowed) {
    return NextResponse.json(
      {
        products: [],
        page: parsed.page,
        limit: parsed.limit,
        total_count: 0,
        has_more: false,
        error: 'rate_limited',
      },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  try {
    const { items, total } = await getShopProducts({
      sort: parsed.sort,
      page: parsed.page,
      pageSize: parsed.limit,
      priceMin: parsed.min,
      priceMax: parsed.max,
      productType: parsed.type,
    })
    const products = items.map(toWire)
    const has_more = products.length > 0 && parsed.page * parsed.limit < total
    return NextResponse.json(
      {
        products,
        page: parsed.page,
        limit: parsed.limit,
        total_count: total,
        has_more,
      },
      { headers: { 'Cache-Control': CacheControl.search } },
    )
  } catch (error) {
    log.error('products.list_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json(
      {
        products: [],
        page: parsed.page,
        limit: parsed.limit,
        total_count: 0,
        has_more: false,
        error: 'products_failed',
      },
      { status: 500 },
    )
  }
}

export const GET = withRequestLog('/api/products', handleGET)
