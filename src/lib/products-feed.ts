import { type SortValue, parseSort } from '@/lib/category-tokens'

/**
 * Shop archive page size for /products and GET /api/products.
 *
 * Live Electro paginated 24. Infinite scroll uses 20 so two fetches are 40,
 * which is the E2E floor, without dumping a 50-card phone page.
 */
export const PRODUCTS_PAGE_SIZE = 20
export const PRODUCTS_MAX_LIMIT = 40

export type ProductsFeedQuery = {
  sort: SortValue
  page: number
  limit: number
  priceMin?: number
  priceMax?: number
  productType?: 'coupon' | 'physical'
}

function first(raw: string | string[] | null | undefined): string | undefined {
  if (raw == null) return undefined
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === '' ? undefined : value
}

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw == null) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

function parsePrice(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function parseProductsFeedQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ProductsFeedQuery {
  const get = (key: string) =>
    params instanceof URLSearchParams ? (params.get(key) ?? undefined) : first(params[key])

  const type = get('type')
  return {
    sort: parseSort(get('sort')),
    page: parsePositiveInt(get('page'), 1, 10_000),
    limit: parsePositiveInt(get('limit'), PRODUCTS_PAGE_SIZE, PRODUCTS_MAX_LIMIT),
    priceMin: parsePrice(get('min')),
    priceMax: parsePrice(get('max')),
    productType: type === 'coupon' || type === 'physical' ? type : undefined,
  }
}

export function shopHasMore(page: number, limit: number, totalCount: number): boolean {
  return page * limit < totalCount
}
