'use server'

import { sanitizeCompareIds } from '@/lib/compare/ids'
import { type CompareProductRow, type CompareViewItem, toCompareViewItem } from '@/lib/compare/view'
import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'

/**
 * `/compare` is a static shell; the columns are one read after hydration,
 * from the ids the browser kept (`lib/compare/client-store.ts`). Like the
 * wishlist view: a server read here would need the request and would take
 * the route out of the static shell under `cacheComponents`.
 *
 * THE USER CLIENT, NOT THE ADMIN ONE. Products are public and RLS on
 * `products` already says what an anonymous reader may see; this action
 * only shapes the answer. A product the policy hides (draft, deleted) comes
 * back absent and the page drops its id from the list, so storage cannot
 * pin a column to a product that no longer exists.
 *
 * ORDER IS THE CALLER'S. PostgREST returns rows in no promised order and the
 * column order on the page is the order the shopper pressed the buttons, so
 * the answer is re-sorted by the ids as they were asked.
 */

export type CompareViewState = { ok: true; items: CompareViewItem[] } | { ok: false; error: string }

const SELECT =
  'id, name_he, slug, images, kenyon_price, price_ils, full_price, stock_quantity, status, deleted_at, type, is_coupon_enabled, brand, sku, city, cashback_percent, requires_shipping, short_description_he, highlights, attributes, category:categories(name_he, slug), supplier:suppliers(name)'

async function runGetCompareView(raw: unknown): Promise<CompareViewState> {
  const ids = sanitizeCompareIds(raw)
  if (ids.length === 0) return { ok: true, items: [] }

  const supabase = await createClient()
  const { data, error } = await supabase.from('products').select(SELECT).in('id', ids)
  if (error) return { ok: false, error: 'לא הצלחנו לטעון את המוצרים להשוואה.' }

  const rows = (data ?? []) as unknown as CompareProductRow[]
  const byId = new Map(rows.map((r) => [r.id, r]))
  const items: CompareViewItem[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) continue
    if (row.deleted_at !== null || row.status !== 'active') continue
    items.push(toCompareViewItem(row))
  }
  return { ok: true, items }
}

/** Everything `/compare` renders, in the order the ids were given. */
export async function getCompareView(ids: unknown): Promise<CompareViewState> {
  return withActionContext('compare.view', () => runGetCompareView(ids))
}
