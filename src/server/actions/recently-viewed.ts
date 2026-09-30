'use server'

import type { Product } from '@/components/ProductCard'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { RECENTLY_VIEWED_MAX_ITEMS } from '@/lib/recently-viewed/guest-storage'
import { createPublicClient } from '@/lib/supabase/anon'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELECT =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories!products_category_id_fkey(name_he, slug)'

type Row = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  full_price: number | null
  images: unknown
  stock_quantity: number | null
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

function toProduct(r: Row): Product {
  const cat = Array.isArray(r.categories) ? (r.categories[0] ?? null) : r.categories
  return {
    id: r.id,
    slug: r.slug,
    name_he: r.name_he,
    kenyon_price: r.kenyon_price,
    full_price: r.full_price,
    images: r.images,
    stock_quantity: r.stock_quantity,
    category: cat,
  }
}

async function runGetRecentlyViewedProducts(ids: string[]): Promise<Product[]> {
  const valid = [...new Set(ids.filter((id) => typeof id === 'string' && UUID.test(id)))].slice(
    0,
    RECENTLY_VIEWED_MAX_ITEMS,
  )
  if (valid.length === 0) return []

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select(SELECT)
      .in('id', valid)
      .eq('status', 'active')
      .is('deleted_at', null)
    if (error) throw error

    const byId = new Map<string, Product>()
    for (const r of (data ?? []) as Row[]) byId.set(r.id, toProduct(r))

    // Re-sorted to the CALLER's order (newest view first) rather than whatever
    // order Postgres returned rows in. A product that no longer exists or is
    // no longer active is simply absent, not rendered blank.
    return valid.map((id) => byId.get(id)).filter((p): p is Product => p != null)
  } catch (error) {
    log.error('recently_viewed.load_failed', { error, count: valid.length })
    return []
  }
}

/**
 * Turns the id list a shopper's OWN browser remembers viewing (see
 * `lib/recently-viewed/guest-storage.ts`) into current catalogue rows.
 *
 * Read-only and unauthenticated on purpose: the list itself never leaves
 * `localStorage` and never reaches this server except as this call's
 * argument, so there is no per-account state to merge or to leak between
 * shoppers. A read failure renders an empty rail rather than an error screen
 * -- this strip is a convenience on top of the product page, not the page.
 */
export async function getRecentlyViewedProducts(ids: string[]): Promise<Product[]> {
  return withActionContext('recently_viewed.load', () => runGetRecentlyViewedProducts(ids))
}
