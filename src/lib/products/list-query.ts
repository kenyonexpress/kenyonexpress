import { type SortValue, parseSort } from '@/lib/category-tokens'

/**
 * One window for the shop's first paint and for `GET /api/products`.
 *
 * The live archive is 24. Infinite scroll uses 20 so page 2 of the API is
 * the same rows the grid appends, not a shifted slice of a 24-wide page.
 */
export const PRODUCTS_PAGE_LIMIT = 20

/** Cards shown while the next page is in flight. */
export const SCROLL_SKELETON_COUNT = 6

export type ShopProductType = 'coupon' | 'physical'

export type ShopListQuery = {
  sort: SortValue
  min?: number
  max?: number
  type?: ShopProductType
}

export type ProductsListQuery = ShopListQuery & {
  page: number
  limit: number
}

function parsePrice(raw: string | null): number | undefined {
  if (raw == null || raw === '') return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parsePage(raw: string | null): number {
  if (raw == null || raw === '') return 1
  const n = Number.parseInt(raw, 10)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

function parseLimit(raw: string | null): number {
  if (raw == null || raw === '') return PRODUCTS_PAGE_LIMIT
  const n = Number.parseInt(raw, 10)
  return Number.isInteger(n) && n >= 1 && n <= PRODUCTS_PAGE_LIMIT ? n : PRODUCTS_PAGE_LIMIT
}

function parseType(raw: string | null): ShopProductType | undefined {
  return raw === 'coupon' || raw === 'physical' ? raw : undefined
}

/** Query string of `GET /api/products`. Unknown sort keys fall back, never 400. */
export function parseProductsListQuery(searchParams: URLSearchParams): ProductsListQuery {
  return {
    sort: parseSort(searchParams.get('sort') ?? undefined),
    page: parsePage(searchParams.get('page')),
    limit: parseLimit(searchParams.get('limit')),
    min: parsePrice(searchParams.get('min')),
    max: parsePrice(searchParams.get('max')),
    type: parseType(searchParams.get('type')),
  }
}
