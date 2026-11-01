'use server'

import type { CompareProduct } from '@/lib/compare/rows'
import { COMPARE_MAX_ITEMS, normalizeCompareIds } from '@/lib/compare/storage'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'

const SELECT =
  'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, short_description_he, coupon_expiry_days, categories!products_category_id_fkey(name_he, slug)'

type Row = Omit<CompareProduct, 'category'> & {
  categories: { name_he: string; slug: string } | { name_he: string; slug: string }[] | null
}

async function runGetCompareProducts(ids: readonly string[]): Promise<CompareProduct[]> {
  const valid = normalizeCompareIds(ids).slice(0, COMPARE_MAX_ITEMS)
  if (valid.length === 0) return []

  try {
    const { data, error } = await createPublicClient()
      .from('products')
      .select(SELECT)
      .in('id', valid)
      .eq('status', 'active')
      .is('deleted_at', null)
    if (error) throw error

    const byId = new Map<string, CompareProduct>()
    for (const row of (data ?? []) as unknown as Row[]) {
      const { categories, ...rest } = row
      const category = Array.isArray(categories) ? (categories[0] ?? null) : categories
      byId.set(row.id, { ...rest, category })
    }
    // The shopper's own order, and a product that is gone is simply absent.
    return valid.map((id) => byId.get(id)).filter((p): p is CompareProduct => p != null)
  } catch (error) {
    log.error('compare.load_failed', { error, count: valid.length })
    return []
  }
}

/**
 * Turns the ids a shopper's own browser holds (`lib/compare/storage.ts`) into
 * current catalogue rows for the comparison table.
 *
 * Read-only and unauthenticated on purpose, like `getRecentlyViewedProducts`:
 * the list never leaves `localStorage` except as this call's argument, the
 * read goes through the public client and its RLS, and only active products
 * come back. A failed read is an empty table, never an error screen.
 */
export async function getCompareProducts(ids: readonly string[]): Promise<CompareProduct[]> {
  return withActionContext('compare.load', () => runGetCompareProducts(ids))
}
