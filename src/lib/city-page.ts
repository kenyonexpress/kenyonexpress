import { CacheLife, CacheTags } from '@/lib/cache/tags'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { CITIES, type City, cityBySlug } from '@/lib/geo/cities'
import { type Locatable, productLocation } from '@/lib/geo/distance'
import { REGIONS, type Region, findRegion } from '@/lib/regions'
import { createCatalogueReadClient } from '@/lib/supabase/read-replica'
import { cacheLife, cacheTag } from 'next/cache'
import { cache } from 'react'

/**
 * The city pages: `/city/[slug]` (STEP 64).
 *
 * ONE ROUTE, TWO KINDS OF SLUG. Live's seventeen region slugs are Hebrew
 * (`תל-אביב`, `השרון`) and were already served here since D19, because they are
 * live URLs with inbound links. The thirteen municipalities in `geo/cities.ts`
 * carry ASCII slugs (`tel-aviv`, `haifa`) and drive the `?city=` filter and the
 * near-me sort. A city page is the second kind; a region page is the first, and
 * from this step on it aggregates the deals of every city it contains. The two
 * sets cannot collide: one is Hebrew letters, the other ASCII, and
 * `city-page.test.ts` asserts it.
 *
 * WHERE A DEAL IS. `productLocation` answers, and nothing else does: the
 * product's own `city` when it has one, the supplier's `city` otherwise, both
 * resolved through `cityByName` so "תל אביב", "תל-אביב" and "תל אביב יפו" are
 * one page and not three. A row whose location resolves to no known city is on
 * no city page. That is the same rule the category filter, the hero tags and
 * the product page's city tag already apply, so the four surfaces cannot
 * disagree about which deals are in a city.
 *
 * MEASURED AGAINST PRODUCTION ON 2026-10-08: 46 active products, none with
 * `products.city`, and none of the seven active suppliers with `suppliers.city`
 * (the five that have one are `closed`). Every city page is therefore empty
 * today, and the empty state says so plainly rather than rendering a grid
 * that reads like a failed query. The aggregation is real and tested, and the
 * first supplier who fills in a city appears on the right page with no code
 * change.
 *
 * `supplier_branches` IS NOT READ. It is anon-readable in name only: the REST
 * probe answers 200 with zero rows under RLS, so a branch-level aggregation
 * would silently be empty forever. When a branch policy opens it, this module
 * is where the join goes.
 *
 * WHAT IS DELIBERATELY ABSENT. No commission column, no contact column, and no
 * rating (migration 232 ended the public display of ratings; the page test
 * refuses the words). `LocalBusiness` is not emitted either: the only address
 * fact this database has is a city name, and a `LocalBusiness` node is a claim
 * about a street door. The page publishes the city itself as a `Place` with
 * the municipal coordinate from `geo/cities.ts`, which is public geographic
 * fact, and lists the deals as an `ItemList`.
 */

export const CITY_PAGE_SIZE = 24

/**
 * The product columns the city page reads.
 *
 * `city`, `latitude` and `longitude` on `products`, and the three on the
 * supplier join, exist in production (probed through the anon REST endpoint
 * on 2026-10-08 with a 200 and null values), which is why this select names
 * them where `category-page.ts` still does not. They are what `productLocation`
 * reads, and omitting them would place every deal by the supplier alone.
 */
export const CITY_PAGE_PRODUCT_COLUMNS =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, city, latitude, longitude, supplier_id, categories!products_category_id_fkey(name_he, slug), suppliers(id, name, city, latitude, longitude)'

export type CityPageCategory = { name_he: string; slug: string }

export type CityPageSupplierJoin = {
  id: string
  name: string
  city: string | null
  latitude?: number | null
  longitude?: number | null
}

/** A product row as PostgREST returns it for the select above. */
export type CityPageProductRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  created_at: string
  type: string
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  supplier_id: string | null
  /** PostgREST returns the embed as an object for a to-one FK, an array otherwise. */
  categories: CityPageCategory | CityPageCategory[] | null
  suppliers: CityPageSupplierJoin | CityPageSupplierJoin[] | null
}

/** A deal on a city page: the card's input, plus the city it was placed in. */
export type CityDeal = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  created_at: string
  categories: CityPageCategory[]
  /** Normalised supplier join, the shape `CategoryProductCard` reads. */
  supplier: { id: string; name: string; city: string | null } | null
  /** The city `productLocation` resolved, always one of the page's cities. */
  city: City
}

export type CityMerchant = {
  id: string
  name: string
  /** Deals this merchant has on the page. */
  dealCount: number
}

export type CityCategoryTally = CityPageCategory & { dealCount: number }

export type CityDeals = {
  deals: CityDeal[]
  /** Most deals first, then Hebrew alphabetical. */
  merchants: CityMerchant[]
  /** Most deals first, then Hebrew alphabetical. */
  categories: CityCategoryTally[]
  /** Deals per city slug, for the region page's chips. Cities with none are present with 0. */
  perCity: Record<string, number>
}

/** What `/city/[slug]` resolved its segment to. */
export type CityPageTarget =
  | { kind: 'city'; city: City; region: Region | null }
  | { kind: 'region'; region: Region; cities: City[] }

/** The region a city belongs to, or null (a city can sit in at most one). */
export function regionOfCity(citySlug: string): Region | null {
  return REGIONS.find((region) => region.cities.includes(citySlug)) ?? null
}

/**
 * Resolve a DECODED segment. Cities are tried first because their slugs are
 * ASCII and a region's are Hebrew, so the order cannot change an answer; it
 * only makes the common case one lookup.
 */
export function resolveCityPage(slug: string): CityPageTarget | null {
  const city = cityBySlug(slug)
  if (city) return { kind: 'city', city, region: regionOfCity(city.slug) }
  const region = findRegion(slug)
  if (!region) return null
  const cities = region.cities.map((s) => cityBySlug(s)).filter((c): c is City => c !== null)
  return { kind: 'region', region, cities }
}

/** The city slugs a page aggregates over. */
export function citySlugsOf(target: CityPageTarget): string[] {
  return target.kind === 'city' ? [target.city.slug] : target.cities.map((c) => c.slug)
}

/** Every slug the route prerenders: thirteen cities and seventeen regions. */
export function allCityPageSlugs(): string[] {
  return [...CITIES.map((c) => c.slug), ...REGIONS.map((r) => r.slug)]
}

/** The href of a city or region page. Encoded here, at the link boundary. */
export function cityPageHref(slug: string): string {
  return `/city/${encodeURIComponent(slug)}`
}

function one<T>(joined: T | T[] | null | undefined): T | null {
  if (Array.isArray(joined)) return joined[0] ?? null
  return joined ?? null
}

const collator = new Intl.Collator('he-IL')

/**
 * Pure: product rows in, the deals that sit in `citySlugs` out, with the
 * merchant and category tallies the page shows above the grid.
 *
 * Rows are expected pre-filtered to active and non-deleted (the query does
 * it). Placement is `productLocation`, so a product's own city overrides its
 * supplier's and a spelling variant resolves to the one city.
 *
 * Order: in-stock deals first, then Hebrew alphabetical by name. Stock here is
 * the cached quantity, same as the card reads; `null` means untracked and
 * counts as in stock, as it does everywhere else in the catalogue.
 */
export function buildCityDeals(
  rows: readonly CityPageProductRow[],
  citySlugs: readonly string[],
): CityDeals {
  const wanted = new Set(citySlugs)
  const perCity: Record<string, number> = {}
  for (const slug of citySlugs) perCity[slug] = 0

  const deals: CityDeal[] = []
  const merchantTally = new Map<string, CityMerchant>()
  const categoryTally = new Map<string, CityCategoryTally>()

  for (const row of rows) {
    const supplierJoin = one(row.suppliers)
    const locatable: Locatable = {
      city: row.city ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      supplier: supplierJoin
        ? {
            city: supplierJoin.city,
            latitude: supplierJoin.latitude ?? null,
            longitude: supplierJoin.longitude ?? null,
          }
        : null,
    }
    const city = productLocation(locatable).city
    if (!city || !wanted.has(city.slug)) continue

    perCity[city.slug] = (perCity[city.slug] ?? 0) + 1

    const category = one(row.categories)
    const categories =
      category && typeof category.slug === 'string' && typeof category.name_he === 'string'
        ? [{ name_he: category.name_he, slug: category.slug }]
        : []
    if (categories[0]) {
      const existing = categoryTally.get(categories[0].slug)
      if (existing) existing.dealCount += 1
      else categoryTally.set(categories[0].slug, { ...categories[0], dealCount: 1 })
    }

    const supplier =
      supplierJoin && typeof supplierJoin.id === 'string'
        ? { id: supplierJoin.id, name: supplierJoin.name, city: supplierJoin.city }
        : null
    if (supplier) {
      const existing = merchantTally.get(supplier.id)
      if (existing) existing.dealCount += 1
      else merchantTally.set(supplier.id, { id: supplier.id, name: supplier.name, dealCount: 1 })
    }

    deals.push({
      id: row.id,
      slug: row.slug,
      name_he: row.name_he,
      kenyon_price: row.kenyon_price,
      full_price: row.full_price,
      images: row.images,
      stock_quantity: row.stock_quantity,
      created_at: row.created_at,
      categories,
      supplier,
      city,
    })
  }

  const inStock = (deal: CityDeal) => deal.stock_quantity === null || deal.stock_quantity > 0
  deals.sort(
    (a, b) => Number(inStock(b)) - Number(inStock(a)) || collator.compare(a.name_he, b.name_he),
  )

  const byCount =
    <T extends { dealCount: number }>(name: (t: T) => string) =>
    (a: T, b: T) =>
      b.dealCount - a.dealCount || collator.compare(name(a), name(b))

  return {
    deals,
    merchants: [...merchantTally.values()].sort(byCount((m) => m.name)),
    categories: [...categoryTally.values()].sort(byCount((c) => c.name_he)),
    perCity,
  }
}

/** One page of deals, 1-based. A page past the end answers the last page. */
export function pageOfDeals(
  deals: readonly CityDeal[],
  page: number,
): { items: CityDeal[]; currentPage: number; totalPages: number; from: number; to: number } {
  const total = deals.length
  const totalPages = Math.max(1, Math.ceil(total / CITY_PAGE_SIZE))
  const safe = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  const currentPage = Math.min(safe, totalPages)
  const start = (currentPage - 1) * CITY_PAGE_SIZE
  const items = deals.slice(start, start + CITY_PAGE_SIZE)
  return {
    items,
    currentPage,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + CITY_PAGE_SIZE, total),
  }
}

/** Hebrew copy for the deal count line. */
export function dealCountLabel(count: number): string {
  if (count <= 0) return 'אין דילים כרגע'
  if (count === 1) return 'דיל אחד'
  return `${count} דילים`
}

/** `<title>` of a city or region page. The city name is the local keyword. */
export function cityPageTitle(name: string): string {
  return `קופונים ודילים ב${name}`
}

/**
 * The meta description. No count in it on purpose: the count changes with the
 * catalogue and a description that changes every day is one a crawler stops
 * trusting, while the canonical and the copy stay put.
 */
export function cityPageDescription(name: string): string {
  return `קופונים, מבצעים ודילים מבתי עסק ב${name}: מסעדות, ספא, בילויים וקניות ב${name} במחיר מוזל. כל שובר נסרק פעם אחת בבית העסק, והתוקף מוצג לפני הרכישה.`
}

/**
 * Every active deal with its location columns, placed by `buildCityDeals`.
 *
 * ONE READ FOR ALL THIRTY PAGES, not a query per city: the placement rule is
 * `cityByName` on free text, which SQL cannot apply (see the city filter note
 * in `category-page.ts`), so the rows are read once under the catalogue cache
 * and filtered in memory. At 46 active rows this is one round trip; the 5000
 * cap is far above the catalogue and far below anything that would need the
 * sitemap's index split.
 */
export async function loadCityDeals(citySlugs: readonly string[]): Promise<CityDeals> {
  'use cache'
  cacheLife(CacheLife.list)
  // `productList` is staled by every product change that moves a list, which
  // is what moves a deal between cities. A supplier row edit (its city) stales
  // nothing in `cacheTagsForChange` today, exactly as on `/s/[id]` and
  // `/merchants`, and rides the five-minute revalidate instead.
  cacheTag(CATALOGUE_TAG, CacheTags.productList)

  const supabase = createCatalogueReadClient()
  const rows = orFail(
    await supabase
      .from('products')
      .select(CITY_PAGE_PRODUCT_COLUMNS)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(5000),
    'catalogue.city_deals_failed',
    { cities: citySlugs.join(',') },
  )
  return buildCityDeals((rows ?? []) as unknown as CityPageProductRow[], citySlugs)
}

export const loadCityDealsCached = cache(loadCityDeals)
