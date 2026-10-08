import 'server-only'

import { isMissingBundleTable } from '@/lib/bundles/load'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin-side reads of bundles (STEP 60): every row, active or not, with the
 * member products named. Service role, because the list must show what the
 * public policy hides (a switched-off bundle), behind the page's own
 * `requireSection('discounts')` gate.
 *
 * `tableExists` is false on a database without 265, and the page says so
 * instead of rendering an empty list that reads as "no bundles yet".
 */

export type AdminBundleItem = {
  product_id: string
  quantity: number
  name_he: string | null
  /** The product's current shekel price, for the composer's running total. */
  kenyon_price: number | null
  status: string | null
}

export type AdminBundle = {
  id: string
  name_he: string
  description_he: string | null
  discount_agorot: number
  is_active: boolean
  starts_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  items: AdminBundleItem[]
}

/** A product the composer may add: active, not deleted. */
export type BundleProductOption = {
  id: string
  name_he: string
  kenyon_price: number | null
  status: string
}

type Row = {
  id: string
  name_he: string
  description_he: string | null
  discount_agorot: number | string
  is_active: boolean
  starts_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  product_bundle_items:
    | {
        product_id: string
        quantity: number | string
        products:
          | { name_he: string | null; kenyon_price: number | null; status: string | null }
          | { name_he: string | null; kenyon_price: number | null; status: string | null }[]
          | null
      }[]
    | null
}

const SELECT =
  'id, name_he, description_he, discount_agorot, is_active, starts_at, expires_at, created_at, updated_at, product_bundle_items(product_id, quantity, products(name_he, kenyon_price, status))'

/** Exported for the tests: the embed shape to the page's shape. */
export function adminBundleFromRow(row: Row): AdminBundle {
  return {
    id: row.id,
    name_he: row.name_he,
    description_he: row.description_he ?? null,
    discount_agorot: Math.trunc(Number(row.discount_agorot)),
    is_active: Boolean(row.is_active),
    starts_at: row.starts_at ?? null,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: (row.product_bundle_items ?? []).map((item) => {
      const product = Array.isArray(item.products) ? (item.products[0] ?? null) : item.products
      return {
        product_id: item.product_id,
        quantity: Math.trunc(Number(item.quantity)),
        name_he: product?.name_he ?? null,
        kenyon_price: product?.kenyon_price == null ? null : Number(product.kenyon_price),
        status: product?.status ?? null,
      }
    }),
  }
}

export async function listBundlesForAdmin(): Promise<{
  bundles: AdminBundle[]
  tableExists: boolean
  error: string | null
}> {
  const { data, error } = await createAdminClient()
    .from('product_bundles' as never)
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingBundleTable(error)) return { bundles: [], tableExists: false, error: null }
    return { bundles: [], tableExists: true, error: error.message }
  }
  return {
    bundles: ((data as Row[] | null) ?? []).map(adminBundleFromRow),
    tableExists: true,
    error: null,
  }
}

export async function readBundleForAdmin(id: string): Promise<AdminBundle | null> {
  const { data, error } = await createAdminClient()
    .from('product_bundles' as never)
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return adminBundleFromRow(data as Row)
}

/** The products a bundle may be composed from, by name. */
export async function listBundleProductOptions(): Promise<BundleProductOption[]> {
  const { data, error } = await createAdminClient()
    .from('products')
    .select('id, name_he, kenyon_price, status')
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('name_he')
    .limit(500)
  if (error) return []
  return ((data as BundleProductOption[] | null) ?? []).map((p) => ({
    id: p.id,
    name_he: p.name_he,
    kenyon_price: p.kenyon_price == null ? null : Number(p.kenyon_price),
    status: p.status,
  }))
}
