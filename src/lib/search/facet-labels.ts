import 'server-only'

import { getCategoryIndex } from '@/lib/category-page'
import { log } from '@/lib/observability/log'
import type { FacetContext } from '@/lib/search/facet-links'
import type { FacetDistribution } from '@/lib/search/faceted'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The names the facet navigation prints: the category tree, and the public
 * name of each supplier the result set contains.
 *
 * `suppliers` RLS is admin-only, so the name comes through the service client,
 * exactly as the product page's supplier block reads it
 * (`loadSupplierPublicContact`). `id` and `name` are the whole selection: the
 * name is printed on every product page already, and nothing else about a
 * supplier belongs in a sidebar.
 *
 * Neither half may fail the page. A missing index leaves the category facet
 * flat; a failed supplier read leaves that facet out. Both are logged.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Enough for any result set here; a longer tail is not a sidebar. */
const MAX_SUPPLIERS = 50

async function loadSupplierNames(ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data, error } = await createAdminClient()
    .from('suppliers')
    .select('id, name')
    .in('id', ids)
  if (error) {
    log.error('search.facet_supplier_names_failed', { reason: error.message })
    return {}
  }
  const names: Record<string, string> = {}
  for (const row of data ?? []) {
    if (typeof row.name === 'string' && row.name.trim()) names[row.id] = row.name.trim()
  }
  return names
}

export async function loadFacetContext(
  facets: FacetDistribution,
  current: URLSearchParams,
): Promise<FacetContext> {
  const supplierIds = new Set(Object.keys(facets.supplier_id ?? {}))
  const selected = current.get('supplier')
  if (selected) supplierIds.add(selected)
  const ids = [...supplierIds].filter((id) => UUID.test(id)).slice(0, MAX_SUPPLIERS)

  const [categoryIndex, supplierNames] = await Promise.all([
    getCategoryIndex().catch((error: unknown) => {
      log.warn('search.facet_category_index_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
      return undefined
    }),
    loadSupplierNames(ids),
  ])
  return { categoryIndex, supplierNames }
}
