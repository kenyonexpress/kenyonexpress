import { CacheControl } from '@/lib/cache/http'
import {
  type ListingQuery,
  loadCategoryListingPage,
  loadShopListingPage,
} from '@/lib/catalogue/listing-page'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * One page of the shop or of a category, as JSON, for the infinite grid
 * (`components/category/InfiniteProductGrid`). The transport only: which
 * products a page holds is decided by `lib/catalogue/listing-page.ts`, with
 * the pages' own parsers and cached loaders.
 */

const KEYS = ['page', 'sort', 'min', 'max', 'type', 'city', 'near'] as const
const SLUG = /^[\p{L}\p{N}_-]{1,120}$/u

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope')
  if (scope !== 'shop' && scope !== 'category') {
    return NextResponse.json({ error: 'invalid_scope' }, { status: 400 })
  }
  const slug = searchParams.get('slug') ?? ''
  if (scope === 'category' && !SLUG.test(slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 })
  }

  const ip = await getClientIp()
  const decision = await rateLimit('catalogue-listing', ip)
  if (!decision.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  const query: Record<string, string | undefined> = {}
  for (const key of KEYS) query[key] = searchParams.get(key) ?? undefined

  const page =
    scope === 'shop'
      ? await loadShopListingPage(query as ListingQuery)
      : await loadCategoryListingPage(slug, query as ListingQuery)
  if (!page) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(page, { headers: { 'Cache-Control': CacheControl.search } })
}

export const GET = withRequestLog('/api/catalogue/listing', handleGET)
