import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import {
  CATEGORY_PAGE_SIZE,
  SHOP_PAGE_SIZE,
  collectionRule,
  getCategoryBySlug,
  getCategoryProductsCached,
  getShopProductsCached,
  parseCity,
  parseProductType,
} from '@/lib/category-page'
import { parseSort } from '@/lib/category-tokens'
import { parseNear, sortByDistance } from '@/lib/geo/distance'

/**
 * One page of a listing, as data: what the infinite grid appends.
 *
 * The category and shop pages render their first page on the server and keep
 * their numbered `?page=` links, which is what a crawler and a browser without
 * script follow. This module answers the same question for page N as JSON, so
 * the grid can append it. It reads the URL with the same parsers and calls the
 * same cached loaders as the pages, so page 2 here is page 2 there.
 *
 * Only the fields the card reads leave the server. A row carries a few more
 * (`created_at`, `type`) and the card has no use for them.
 */

export type ListingQuery = Readonly<Record<string, string | undefined>>

export type ListingPage = {
  items: CategoryProduct[]
  page: number
  totalPages: number
  total: number
}

/** The highest page the endpoint will read. Past it is a crawler, not a shopper. */
export const MAX_LISTING_PAGE = 500

export function parseListingPage(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 1
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, MAX_LISTING_PAGE)
}

function parsePrice(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

type CardSource = CategoryProduct & { [key: string]: unknown }

export function toListingCard(row: CardSource): CategoryProduct {
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    kenyon_price: row.kenyon_price,
    full_price: row.full_price ?? null,
    images: row.images,
    stock_quantity: row.stock_quantity ?? null,
    categories: (row.categories ?? []).map((c) => ({ name_he: c.name_he, slug: c.slug })),
    supplier: row.supplier ? { city: row.supplier.city ?? null } : null,
    ...(row.offer_valid_until ? { offer_valid_until: row.offer_valid_until } : {}),
    ...(row.distanceKm != null ? { distanceKm: row.distanceKm } : {}),
  }
}

function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export async function loadShopListingPage(query: ListingQuery): Promise<ListingPage> {
  const page = parseListingPage(query.page)
  const { items, total } = await getShopProductsCached({
    sort: parseSort(query.sort),
    page,
    priceMin: parsePrice(query.min),
    priceMax: parsePrice(query.max),
    productType: parseProductType(query.type),
  })
  return {
    items: items.map((row) => toListingCard(row as unknown as CardSource)),
    page,
    totalPages: pageCount(total, SHOP_PAGE_SIZE),
    total,
  }
}

/** Null when the slug is not a category. */
export async function loadCategoryListingPage(
  slug: string,
  query: ListingQuery,
): Promise<ListingPage | null> {
  const category = await getCategoryBySlug(slug)
  if (!category) return null
  const page = parseListingPage(query.page)
  const { items, total } = await getCategoryProductsCached({
    categoryId: category.id,
    category: { name_he: category.name_he, slug: category.slug },
    sort: parseSort(query.sort),
    page,
    priceMin: parsePrice(query.min),
    priceMax: parsePrice(query.max),
    productType: parseProductType(query.type),
    city: parseCity(query.city),
    collection: collectionRule(category.slug),
  })
  // Nearest first is applied to the cached page, exactly as the page does it.
  const near = parseNear(query.near)
  const ordered = near ? sortByDistance(items, near) : items
  return {
    items: ordered.map((row) => toListingCard(row as unknown as CardSource)),
    page,
    totalPages: pageCount(total, CATEGORY_PAGE_SIZE),
    total,
  }
}
