import type { SortValue } from '@/components/category/CategoryControlBar'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { cityBySlug } from '@/lib/geo/cities'
import { filterByCity } from '@/lib/geo/distance'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'
import { cache } from 'react'

/**
 * Every read in this file is CACHED and runs on the anon client.
 *
 * Two changes that belong together. The reads used to go through
 * `createClient()`, which reads cookies, and that had two consequences: no
 * catalogue answer could ever be cached (a cached scope cannot touch request
 * APIs), and the rows returned depended on who was asking - an admin's session
 * could see rows a shopper could not, from the same function.
 * `createPublicClient()` is always exactly `anon`, which is both cacheable and
 * the same catalogue for everybody. It is the client the cart already reads the
 * catalogue with, proven against the hosted project.
 *
 * The invalidation contract is in src/lib/catalogue-cache.ts and it is not
 * optional: a write that does not call `updateTag(CATALOGUE_TAG)` is invisible
 * on the storefront for an hour, silently.
 *
 * `cacheLife('hours')` - 1 hour revalidate, 1 day expire. The expire is the
 * part worth having: if Supabase is unreachable, the last good catalogue keeps
 * being served instead of an empty grid.
 *
 * The two calls are repeated in each function rather than factored into a
 * helper. `cacheLife` and `cacheTag` are directives about the scope they are
 * written in, and hiding them behind a call makes it possible to add a `use
 * cache` function here that silently has neither.
 */

export const CATEGORY_PAGE_SIZE = 12

type Orderable<T> = { order(column: string, opts: { ascending: boolean }): T }

/**
 * The menu order, with the tie-break that makes it an order at all.
 *
 * `categories.sort_order` is not unique and, measured against production on
 * 19.08.2026, is not distinct either: `electronics` and `professionals` both
 * sit on 10, and the 12 rows carry the values 1..11. Ordering by that column
 * alone leaves the position of those two to whatever the planner returns, and
 * because these reads are `use cache` with an hour of life, a reshuffle can
 * survive in the sidebar long after the query that produced it.
 *
 * The second key is `slug`, which is UNIQUE, so the result is total. It is not
 * a UNIQUE constraint on `sort_order`, deliberately: `CategoryTree` reorders
 * by swapping two rows in two separate `updateCategorySortOrder` calls, and a
 * unique index would fail the first of them and break the admin's reordering.
 * `migrations/pending/006-categories-sort-order.sql` renumbers the data; this
 * is what holds regardless of the data.
 */
export function orderedByMenu<T extends Orderable<T>>(query: T): T {
  return query.order('sort_order', { ascending: true }).order('slug', { ascending: true })
}

export type CategoryRow = {
  id: string
  slug: string
  name_he: string
  description_he: string | null
  parent_id: string | null
}

export type CategoryProductRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  created_at: string
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
  /** The raw PostgREST join, singular or array depending on the relationship. */
  suppliers?: SupplierJoin | SupplierJoin[] | null
  /** Normalised by normalizeCategoryJoin. This is what the geo helpers read. */
  supplier?: SupplierJoin | null
}

/**
 * `latitude`/`longitude` are optional because they arrive with PENDING-110 and
 * are not selected yet. Typed here so the geo helpers compile against the
 * shape they will have, without the query pretending the columns exist.
 */
type SupplierJoin = {
  city: string | null
  latitude?: number | null
  longitude?: number | null
}

export async function getCategoryBySlug(slug: string): Promise<CategoryRow | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name_he, description_he, parent_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  return data
}

export async function getAllCategorySlugs(): Promise<string[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const { data } = await orderedByMenu(
    supabase.from('categories').select('slug').eq('is_active', true),
  )
  return (data ?? []).map((c) => c.slug)
}

export async function getCategoryParent(
  parentId: string,
): Promise<{ slug: string; name_he: string } | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('categories')
    .select('slug, name_he')
    .eq('id', parentId)
    .single()
  return data
}

export async function getCategoryChildren(
  categoryId: string,
): Promise<{ id: string; slug: string; name_he: string }[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const { data } = await orderedByMenu(
    supabase
      .from('categories')
      .select('id, slug, name_he')
      .eq('parent_id', categoryId)
      .eq('is_active', true),
  )
  return data ?? []
}

function normalizeCategoryJoin(
  row: CategoryProductRow,
  fallback: { name_he: string; slug: string },
): CategoryProductRow & { categories: { name_he: string; slug: string }[] } {
  const joined = row.categories
  const primary = Array.isArray(joined) ? joined[0] : joined
  const tags = primary ? [primary] : [fallback]

  // PostgREST returns a to-one join as an object and a to-many as an array, and
  // which one you get depends on how it reads the foreign key. Normalising here
  // means every geo helper downstream reads `supplier` and never has to know.
  const supplierJoin = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers

  return { ...row, categories: tags, supplier: supplierJoin ?? null }
}

/** `products.type` values in use: 'coupon' and 'physical'. */
export type ProductTypeFilter = 'coupon' | 'physical'

/**
 * The archive facet, as a PostgREST filter.
 *
 * A product counts as a coupon if `type = 'coupon'` OR `is_coupon_enabled` is
 * set. Filtering on the `type` column alone was wrong and visibly so: the
 * product page, `lib/cart/pricing.ts`, the commission engine and the
 * Meilisearch document builder all read `is_coupon_enabled` as well, so a
 * product sold as a coupon, priced as a coupon and settled as a coupon did not
 * appear in the coupon archive. `barbecue` is exactly that row.
 *
 * The physical side is the strict complement, so the two facets still partition
 * the catalogue and their counts still add up to the unfiltered total.
 */
export function productTypeFilter(productType: ProductTypeFilter): {
  column: string
  value: string
} {
  return productType === 'coupon'
    ? { column: 'or', value: 'type.eq.coupon,is_coupon_enabled.is.true' }
    : { column: 'and', value: 'type.neq.coupon,is_coupon_enabled.is.false' }
}

/**
 * The city slug from the URL, or undefined.
 *
 * Validated against the city table rather than passed through: an unknown slug
 * becomes "no filter" instead of an empty page, and nothing user-controlled
 * reaches a query.
 */
export function parseCity(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && cityBySlug(value) ? value : undefined
}

export function parseProductType(
  raw: string | string[] | undefined,
): ProductTypeFilter | undefined {
  return raw === 'coupon' || raw === 'physical' ? raw : undefined
}

export async function getCategoryProducts(opts: {
  categoryId: string
  category: { name_he: string; slug: string }
  sort: SortValue
  page: number
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
  /** City slug. Part of the cache key, so two cities never share a page. */
  city?: string
}): Promise<{ items: CategoryProductRow[]; total: number }> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { categoryId, category, sort, page, priceMin, priceMax, productType, city } = opts
  const supabase = createPublicClient()
  const from = (page - 1) * CATEGORY_PAGE_SIZE

  let query = supabase
    .from('products')
    .select(
      // `city` ONLY. `latitude`/`longitude` arrive with PENDING-110 and do not
      // exist in this database yet - naming a missing column is Postgres 42703,
      // which fails the WHOLE select, so every category page would render an
      // empty grid. That exact failure is why src/lib/supabase/optional-columns.ts
      // exists. Add the two columns to this string when PENDING-110 is applied;
      // `supplierLocation` already prefers them the moment they are present.
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, categories!products_category_id_fkey(name_he, slug), suppliers(city)',
      { count: 'exact' },
    )
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .is('deleted_at', null)

  if (priceMin != null) query = query.gte('kenyon_price', priceMin)
  if (priceMax != null) query = query.lte('kenyon_price', priceMax)
  if (productType) {
    const facet = productTypeFilter(productType)
    query = facet.column === 'or' ? query.or(facet.value) : query.or(`and(${facet.value})`)
  }

  switch (sort) {
    case 'price_asc':
      query = query.order('kenyon_price', { ascending: true, nullsFirst: false })
      break
    case 'price_desc':
      query = query.order('kenyon_price', { ascending: false, nullsFirst: false })
      break
    case 'name':
      query = query.order('name_he', { ascending: true })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    default:
      // menu_order / popularity / rating: live default archive order matches
      // Hebrew-alphabetical name order; there is no menu_order column here.
      query = query.order('name_he', { ascending: true })
  }

  const { data, count } = await query.range(from, from + CATEGORY_PAGE_SIZE - 1)
  const items = (data ?? []).map((row) =>
    normalizeCategoryJoin(row as CategoryProductRow, category),
  )

  /**
   * The city filter runs HERE, on the page that was fetched, and not as a
   * PostgREST `.eq('suppliers.city', ...)`.
   *
   * Two reasons, and the second is the one that matters. First, `suppliers.city`
   * is free text a person typed, so "תל אביב" and "תל-אביב" are the same city
   * to `cityByName` and two different strings to the database - filtering in
   * SQL would silently drop the second spelling. Second, this project's rule is
   * one implementation per decision: the tag row, the picker and this query all
   * ask `filterByCity`, so they cannot disagree about which deals are in a city.
   *
   * The cost is that `total` counts the unfiltered set, so pagination is
   * approximate while a city is selected. Stated rather than hidden: with a
   * catalogue of 80 products this is one page either way, and fixing it
   * properly needs the coordinates from PENDING-110, not a second filter.
   */
  const filtered = city ? (filterByCity(items, city) as typeof items) : items

  return { items: filtered, total: city ? filtered.length : (count ?? 0) }
}

export async function getAllCategories(): Promise<{ slug: string; name_he: string }[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const { data } = await orderedByMenu(
    supabase.from('categories').select('slug, name_he').eq('is_active', true),
  )
  return data ?? []
}

export const SHOP_PAGE_SIZE = 24

/** All active products for /products (live /shop/ archive), same sort rules. */
export async function getShopProducts(opts: {
  sort: SortValue
  page: number
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
}): Promise<{ items: CategoryProductRow[]; total: number }> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { sort, page, priceMin, priceMax, productType } = opts
  const supabase = createPublicClient()
  const from = (page - 1) * SHOP_PAGE_SIZE

  let query = supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, categories!products_category_id_fkey(name_he, slug)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .is('deleted_at', null)

  if (priceMin != null) query = query.gte('kenyon_price', priceMin)
  if (priceMax != null) query = query.lte('kenyon_price', priceMax)
  if (productType) {
    const facet = productTypeFilter(productType)
    query = facet.column === 'or' ? query.or(facet.value) : query.or(`and(${facet.value})`)
  }

  switch (sort) {
    case 'price_asc':
      query = query.order('kenyon_price', { ascending: true, nullsFirst: false })
      break
    case 'price_desc':
      query = query.order('kenyon_price', { ascending: false, nullsFirst: false })
      break
    case 'name':
      query = query.order('name_he', { ascending: true })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    default:
      query = query.order('name_he', { ascending: true })
  }

  const { data, count } = await query.range(from, from + SHOP_PAGE_SIZE - 1)
  const items = (data ?? []).map((row) => {
    const r = row as CategoryProductRow
    const joined = r.categories
    const primary = Array.isArray(joined) ? joined[0] : joined
    return { ...r, categories: primary ? [primary] : [] }
  })
  return { items, total: count ?? 0 }
}

/**
 * Request-scoped memoisation of the archive queries.
 *
 * The result count renders in the page header and the grid renders in the body,
 * and each sits behind its own Suspense boundary so the shell can stream first.
 * Without `cache` that would issue the same query twice per request; with it
 * both boundaries share one round trip.
 *
 * Kept even though the wrapped functions now carry `use cache`, which already
 * makes a second call within a request a cache hit. The two do different jobs:
 * `use cache` dedupes ACROSS requests and has to serialise the arguments and
 * the result to do it, `cache` dedupes within one and does not. On a cold entry
 * this is still the difference between one round trip and two.
 */
export const getCategoryProductsCached = cache(getCategoryProducts)
export const getShopProductsCached = cache(getShopProducts)
