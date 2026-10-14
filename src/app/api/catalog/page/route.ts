import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import { CacheControl } from '@/lib/cache/http'
import {
  type ArchivePageItem,
  type ArchivePageResponse,
  parsePage,
  parsePrice,
} from '@/lib/catalog-archive'
import {
  CATEGORY_PAGE_SIZE,
  type CategoryProductRow,
  SHOP_PAGE_SIZE,
  collectionRule,
  getCategoryBySlug,
  getCategoryProductsCached,
  getShopProductsCached,
  parseBrand,
  parseCity,
  parseProductType,
} from '@/lib/category-page'
import { parseSort } from '@/lib/category-tokens'
import { parseMinDiscount } from '@/lib/discount-percent'
import { parseNear, sortByDistance } from '@/lib/geo/distance'
import { blurEntryFor, firstImageOf } from '@/lib/images/blur'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { attachPriceHistory } from '@/lib/pricing/price-history-read'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * One page of an archive as JSON, for the grid's continuous mode (UX22).
 *
 * The transport for the same two cached readers the pages call directly:
 * `getCategoryProductsCached` when `slug` names a category, and
 * `getShopProductsCached` for `/products` when it does not. The query string
 * is parsed by the SAME functions the pages use (`lib/catalog-archive.ts`,
 * `lib/category-page.ts`), so the page this route appends under the grid is
 * the page the numbered link would have opened: same filters, same order,
 * same 24-wide window. The price-history marks and the blur manifest's
 * entry per thumb come along too, so a card that arrived by scrolling is
 * drawn by `CategoryProductCard` exactly as a card that arrived in the HTML.
 *
 * Everything this route does that the readers do not is HTTP: a rate limit,
 * a 404 for a slug no active category has, and the archive's edge TTL.
 */

const empty = { items: [] as ArchivePageItem[], total: 0 }

type ReaderResult = { items: CategoryProductRow[]; total: number }

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sp = (name: string) => searchParams.get(name) ?? undefined

  // Keyed per IP like every public read route; one shopper scrolling an
  // archive is a handful of requests, and a loop that runs away is not.
  const ip = await getClientIp()
  const decision = await rateLimit('catalog-page', ip)
  if (!decision.allowed) {
    return NextResponse.json(
      { ...empty, page: 1, totalPages: 1, pageSize: SHOP_PAGE_SIZE, error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  const page = parsePage(sp('page'))
  const sort = parseSort(sp('sort'))
  const priceMin = parsePrice(sp('min'))
  const priceMax = parsePrice(sp('max'))
  const productType = parseProductType(sp('type'))
  const slug = sp('slug')?.trim()

  let result: ReaderResult
  let pageSize: number
  if (slug) {
    const category = await getCategoryBySlug(slug)
    if (!category) {
      return NextResponse.json(
        { ...empty, page, totalPages: 1, pageSize: CATEGORY_PAGE_SIZE, error: 'unknown_category' },
        { status: 404 },
      )
    }
    pageSize = CATEGORY_PAGE_SIZE
    result = await getCategoryProductsCached({
      categoryId: category.id,
      category: { name_he: category.name_he, slug: category.slug },
      sort,
      page,
      priceMin,
      priceMax,
      productType,
      city: parseCity(sp('city')),
      brand: parseBrand(sp('brand')),
      minDiscount: parseMinDiscount(sp('discount')),
      collection: collectionRule(category.slug),
    })
  } else {
    pageSize = SHOP_PAGE_SIZE
    result = await getShopProductsCached({ sort, page, priceMin, priceMax, productType })
  }

  // The same two steps the page's grid takes after the cached read, in the
  // same order: the history marks first, then nearest-first when the shopper
  // asked for it, so the order appended is the order the page would render.
  const withHistory = await attachPriceHistory(result.items)
  const near = parseNear(sp('near'))
  const ordered = near ? sortByDistance(withHistory, near) : withHistory
  const items: ArchivePageItem[] = ordered.map((product) => {
    const asset = blurEntryFor(firstImageOf(product.images))
    return {
      ...(product as CategoryProduct),
      blur: asset?.blur,
      dimensions: asset ? { w: asset.w, h: asset.h } : undefined,
    }
  })

  const body: ArchivePageResponse = {
    items,
    total: result.total,
    page,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    pageSize,
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': CacheControl.catalogPage } })
}

export const GET = withRequestLog('/api/catalog/page', handleGET)
