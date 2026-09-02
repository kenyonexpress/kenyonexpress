import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail, orFailWithCount } from '@/lib/catalogue-read'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'
import { cache } from 'react'

/**
 * Public supplier catalogue. `/s/[id]`, not `/suppliers`.
 *
 * `/suppliers` is the join-us marketing page. This is the shopper-facing list
 * of one active supplier's live products. Tagged with `CATALOGUE_TAG` so an
 * admin save that calls `updateTag` refreshes it the same way the category
 * archive does.
 *
 * WHAT IS DELIBERATELY ABSENT. `platform_percent`, `supplier_split_percent`,
 * and every other commission column. Those are an admin fact. Putting them in
 * this select would put them in the RSC payload, which is the customer DOM.
 */

export const SUPPLIER_PAGE_SIZE = 24

export const SUPPLIER_STOREFRONT_PRODUCT_COLUMNS =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, categories!products_category_id_fkey(name_he, slug)'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSupplierId(value: string): boolean {
  return UUID_RE.test(value)
}

export type SupplierStorefront = {
  id: string
  name: string
  city: string | null
  logoUrl: string | null
  address: string | null
  contactPhone: string | null
}

export type SupplierStorefrontProduct = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  type: string
  categories: { name_he: string; slug: string }[]
}

export async function loadSupplierStorefront(id: string): Promise<SupplierStorefront | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  if (!isSupplierId(id)) return null

  const supabase = createPublicClient()
  const row = orFail(
    await supabase
      .from('suppliers')
      .select('id, name, city, logo_url, address, contact_phone, status, deleted_at')
      .eq('id', id)
      .maybeSingle(),
    'catalogue.supplier_storefront_failed',
    { id },
  )
  if (!row || row.status !== 'active' || row.deleted_at) return null
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    logoUrl: row.logo_url,
    address: row.address,
    contactPhone: row.contact_phone,
  }
}

export async function loadSupplierStorefrontProducts(
  supplierId: string,
  page: number,
): Promise<{ items: SupplierStorefrontProduct[]; total: number }> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  if (!isSupplierId(supplierId)) return { items: [], total: 0 }

  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  const from = (safePage - 1) * SUPPLIER_PAGE_SIZE
  const supabase = createPublicClient()
  const { data, count } = orFailWithCount(
    await supabase
      .from('products')
      .select(SUPPLIER_STOREFRONT_PRODUCT_COLUMNS, { count: 'exact' })
      .eq('supplier_id', supplierId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name_he', { ascending: true })
      .range(from, from + SUPPLIER_PAGE_SIZE - 1),
    'catalogue.supplier_products_failed',
    { supplierId, page: safePage },
  )

  const items = (data ?? []).map((row) => {
    const joined = (row as { categories?: unknown }).categories
    const primary = Array.isArray(joined) ? joined[0] : joined
    return {
      ...(row as SupplierStorefrontProduct),
      categories: primary ? [primary as { name_he: string; slug: string }] : [],
    }
  })
  return { items, total: count ?? 0 }
}

export async function listSupplierIdsForPrerender(): Promise<string[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const rows = orFail(
    await supabase
      .from('suppliers')
      .select('id')
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(500),
    'catalogue.supplier_ids_failed',
  )
  return (rows ?? []).map((row) => row.id)
}

export const loadSupplierStorefrontCached = cache(loadSupplierStorefront)
export const loadSupplierStorefrontProductsCached = cache(loadSupplierStorefrontProducts)
