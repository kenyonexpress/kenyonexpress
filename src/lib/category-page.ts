import type { SortValue } from '@/components/category/CategoryControlBar'
import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export const CATEGORY_PAGE_SIZE = 12

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
}

export async function getCategoryBySlug(slug: string): Promise<CategoryRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name_he, description_he, parent_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  return data
}

export async function getAllCategorySlugs(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('slug')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data ?? []).map((c) => c.slug)
}

export async function getCategoryParent(
  parentId: string,
): Promise<{ slug: string; name_he: string } | null> {
  const supabase = await createClient()
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
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name_he')
    .eq('parent_id', categoryId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return data ?? []
}

function normalizeCategoryJoin(
  row: CategoryProductRow,
  fallback: { name_he: string; slug: string },
): CategoryProductRow & { categories: { name_he: string; slug: string }[] } {
  const joined = row.categories
  const primary = Array.isArray(joined) ? joined[0] : joined
  const tags = primary ? [primary] : [fallback]
  return { ...row, categories: tags }
}

/** `products.type` values in use: 'coupon' and 'physical'. */
export type ProductTypeFilter = 'coupon' | 'physical'

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
}): Promise<{ items: CategoryProductRow[]; total: number }> {
  const { categoryId, category, sort, page, priceMin, priceMax, productType } = opts
  const supabase = await createClient()
  const from = (page - 1) * CATEGORY_PAGE_SIZE

  let query = supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, categories(name_he, slug)',
      { count: 'exact' },
    )
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .is('deleted_at', null)

  if (priceMin != null) query = query.gte('kenyon_price', priceMin)
  if (priceMax != null) query = query.lte('kenyon_price', priceMax)
  if (productType) query = query.eq('type', productType)

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
  return { items, total: count ?? 0 }
}

export async function getAllCategories(): Promise<{ slug: string; name_he: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('slug, name_he')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
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
  const { sort, page, priceMin, priceMax, productType } = opts
  const supabase = await createClient()
  const from = (page - 1) * SHOP_PAGE_SIZE

  let query = supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, categories(name_he, slug)',
      { count: 'exact' },
    )
    .eq('status', 'active')
    .is('deleted_at', null)

  if (priceMin != null) query = query.gte('kenyon_price', priceMin)
  if (priceMax != null) query = query.lte('kenyon_price', priceMax)
  if (productType) query = query.eq('type', productType)

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
 */
export const getCategoryProductsCached = cache(getCategoryProducts)
export const getShopProductsCached = cache(getShopProducts)
