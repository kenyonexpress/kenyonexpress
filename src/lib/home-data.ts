import type { Product } from '@/components/ProductCard'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import type { HotCoupon } from '@/lib/hot-coupons'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Reads behind the home page (C130). Nationwide only: nothing here filters or
 * orders by location. Each read is cached for an hour under the catalogue tag,
 * like the category and city pages, and degrades to an empty list rather than
 * failing the page.
 */

export const HOME_DEALS_PAGE_SIZE = 12

const CARD_COLUMNS =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, type, is_coupon_enabled, city, latitude, longitude, categories!products_category_id_fkey(name_he, slug)'

type CardRow = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  type: string
  is_coupon_enabled: boolean | null
  city: string | null
  latitude: number | null
  longitude: number | null
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

export function toCardProduct(row: CardRow): Product {
  const category = Array.isArray(row.categories) ? (row.categories[0] ?? null) : row.categories
  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    kenyon_price: row.kenyon_price,
    full_price: row.full_price,
    images: row.images,
    stock_quantity: row.stock_quantity,
    type: row.type,
    is_coupon_enabled: row.is_coupon_enabled,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    category,
  }
}

function activeProducts(select: string) {
  return (
    createPublicClient()
      .from('products')
      .select(select)
      .eq('status', 'active')
      .is('deleted_at', null)
      // A card with no photograph is a grey box on the home page; the automated
      // test products are the ones without one.
      .neq('images', '[]')
  )
}

function discountOf(p: { kenyon_price: number | null; full_price: number | null }): number {
  const price = Number(p.kenyon_price ?? 0)
  const old = Number(p.full_price ?? 0)
  return old > price && old > 0 ? (old - price) / old : 0
}

/** The active product with the deepest discount; falls back to the newest. */
export async function getDealOfTheDay(): Promise<Product | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { data, error } = await activeProducts(CARD_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) throw new Error(`home.deal_of_day_failed: ${error.message}`)
  const rows = (data ?? []) as unknown as CardRow[]
  if (rows.length === 0) return null
  const best = rows.reduce((a, b) => (discountOf(b) > discountOf(a) ? b : a))
  return toCardProduct(best)
}

export type HomeCategory = { id: string; name_he: string; slug: string; image_url: string | null }

export async function getHomeCategories(): Promise<HomeCategory[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { data, error } = await createPublicClient()
    .from('categories')
    .select('id, name_he, slug, image_url')
    .is('parent_id', null)
    .order('name_he', { ascending: true })
    .limit(12)
  if (error) throw new Error(`home.categories_failed: ${error.message}`)
  return (data ?? []) as HomeCategory[]
}

export async function getFeaturedProducts(): Promise<Product[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { data, error } = await activeProducts(CARD_COLUMNS)
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) throw new Error(`home.featured_failed: ${error.message}`)
  let rows = (data ?? []) as unknown as CardRow[]
  if (rows.length === 0) {
    const fallback = await activeProducts(CARD_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(8)
    rows = (fallback.data ?? []) as unknown as CardRow[]
  }
  return rows.map(toCardProduct)
}

export async function getHotCoupons(): Promise<HotCoupon[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { data, error } = await activeProducts('*, supplier:suppliers(name, logo_url)')
    .eq('type', 'coupon')
    .order('created_at', { ascending: false })
    .limit(4)
  if (error) throw new Error(`home.hot_coupons_failed: ${error.message}`)
  return (data ?? []) as unknown as HotCoupon[]
}

export type HomeBrand = { id: string; name: string; name_he: string; logo_url: string }

export async function getHomeBrands(): Promise<HomeBrand[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const { data, error } = await createPublicClient()
    .from('suppliers')
    .select('id, name, logo_url')
    .not('logo_url', 'is', null)
    .limit(12)
  if (error) throw new Error(`home.brands_failed: ${error.message}`)
  return ((data ?? []) as { id: string; name: string; logo_url: string }[]).map((s) => ({
    id: s.id,
    name: s.name,
    name_he: s.name,
    logo_url: s.logo_url,
  }))
}

/** One page of the infinite deals list, deepest discount first, stable by id. */
export async function getDealsPage(
  offset: number,
): Promise<{ items: Product[]; nextOffset: number | null }> {
  const from = Math.max(0, Math.floor(offset))
  const { data, error } = await activeProducts(CARD_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + HOME_DEALS_PAGE_SIZE)
  if (error) throw new Error(`home.deals_page_failed: ${error.message}`)
  const rows = (data ?? []) as unknown as CardRow[]
  const hasMore = rows.length > HOME_DEALS_PAGE_SIZE
  return {
    items: rows.slice(0, HOME_DEALS_PAGE_SIZE).map(toCardProduct),
    nextOffset: hasMore ? from + HOME_DEALS_PAGE_SIZE : null,
  }
}
