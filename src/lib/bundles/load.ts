import 'server-only'

import type { BundleDefinition } from '@/lib/bundles/evaluate'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'

/**
 * Reads of `product_bundles` for the storefront (STEP 60).
 *
 * Both go through the anon key: the policy exposes active bundles and their
 * items only, which is exactly the set the cart and the product page may
 * know about. Nothing here needs the service role, and a reader that used it
 * would show a shopper a bundle the admin has switched off.
 *
 * Before migration 265 is applied the tables do not exist. Postgres answers
 * 42P01 and PostgREST relays it; that reads as "no bundles", logged once at
 * warn, and the cart prices exactly as it did before this step. Any other
 * error is also "no bundles": a saving that fails to load must not fail the
 * cart, and a cart that cannot price a saving simply does not show one.
 */

/**
 * What a database without 265 answers. Postgres says `42P01`; PostgREST,
 * which is what the anon client talks to, answers `PGRST205` ("Could not
 * find the table in the schema cache") before Postgres is ever asked, and
 * that is the code the production prerender actually measured on
 * 2026-10-08. Both are "no bundles", and so is either message.
 */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

export function isMissingBundleTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true
  return /relation .* does not exist|could not find the table/i.test(error.message ?? '')
}

/** The columns a storefront read selects; items embedded through the FK. */
export const BUNDLE_SELECT =
  'id, name_he, description_he, discount_agorot, starts_at, expires_at, product_bundle_items(product_id, quantity)'

type BundleRow = {
  id: string
  name_he: string
  description_he?: string | null
  discount_agorot: number | string
  starts_at: string | null
  expires_at: string | null
  product_bundle_items: { product_id: string; quantity: number | string }[] | null
}

/**
 * The row as the evaluator wants it. Exported for the tests: the shape is
 * the contract between the two readers below and `evaluateBundles`.
 */
export function bundleFromRow(row: BundleRow): BundleDefinition {
  return {
    id: row.id,
    name_he: row.name_he,
    discount_agorot: Math.trunc(Number(row.discount_agorot)),
    starts_at: row.starts_at ?? null,
    expires_at: row.expires_at ?? null,
    items: (row.product_bundle_items ?? []).map((item) => ({
      product_id: item.product_id,
      quantity: Math.trunc(Number(item.quantity)),
    })),
  }
}

let warnedAbsent = false

/**
 * One warning per process for the absent table, not one per cart or per
 * prerendered product page: the build logged it 46 times before this was
 * a function, and a line repeated that often is a line nobody reads.
 */
export function noteBundleTableAbsent(where: string): void {
  if (warnedAbsent) return
  warnedAbsent = true
  log.warn('bundles.table_absent', { where, hint: 'migration 265 not applied' })
}

function noBundles(error: { code?: string; message: string }, where: string): BundleDefinition[] {
  if (isMissingBundleTable(error)) {
    noteBundleTableAbsent(where)
    return []
  }
  log.warn('bundles.read_failed', { where, reason: error.message })
  return []
}

/**
 * Every active bundle that names at least one of `productIds`. The cart
 * calls this with every product it holds; a bundle whose other members are
 * absent comes back too and the evaluator finds it incomplete, which is
 * cheaper than a second query per bundle and gives the same answer.
 */
export async function loadBundlesForProducts(productIds: string[]): Promise<BundleDefinition[]> {
  const ids = [...new Set(productIds.filter((id) => typeof id === 'string' && id.length > 0))]
  if (ids.length === 0) return []

  const supabase = createPublicClient()
  const { data: memberships, error: memberError } = await supabase
    .from('product_bundle_items' as never)
    .select('bundle_id')
    .in('product_id', ids)
  if (memberError) return noBundles(memberError, 'items')

  const bundleIds = [
    ...new Set(((memberships as { bundle_id: string }[] | null) ?? []).map((m) => m.bundle_id)),
  ]
  if (bundleIds.length === 0) return []

  const { data, error } = await supabase
    .from('product_bundles' as never)
    .select(BUNDLE_SELECT)
    .in('id', bundleIds)
    .eq('is_active', true)
  if (error) return noBundles(error, 'bundles')

  return ((data as BundleRow[] | null) ?? []).map(bundleFromRow)
}
