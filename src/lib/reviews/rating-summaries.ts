import { log } from '@/lib/observability/log'
import { aggregateRatings } from '@/lib/reviews/eligibility'
import type { createPublicClient } from '@/lib/supabase/anon'
import { TABLE_MISSING } from '@/lib/supabase/error-codes'

/**
 * The star row for a set of product cards, keyed by product id.
 *
 * Shared by `lib/related-products.ts` (the PDP's "מומלצים" strip) and
 * `lib/homepage/rails.ts` (the home page's rule/manual rails): both render the
 * same card and the same row under the same title, so they read it the same
 * way. Degrades to an empty map on any read failure - a missing `reviews`
 * table (`TABLE_MISSING`, the grant migration 247 pending) or any other error
 * - rather than throwing, because a star row is an enhancement to a page that
 * renders correctly without it.
 */
export async function loadRatingSummaries(
  supabase: ReturnType<typeof createPublicClient>,
  productIds: readonly string[],
  logKey: string,
): Promise<Map<string, { count: number; averageTenths: number }>> {
  if (productIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('reviews')
    .select('product_id, rating')
    .in('product_id', productIds)
    .eq('status', 'approved')
    .is('deleted_at', null)

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn(logKey, { code: error.code ?? null })
    }
    return new Map()
  }

  const byProduct = new Map<string, number[]>()
  for (const row of (data ?? []) as { product_id: string; rating: number }[]) {
    const list = byProduct.get(row.product_id) ?? []
    list.push(row.rating)
    byProduct.set(row.product_id, list)
  }

  const summaries = new Map<string, { count: number; averageTenths: number }>()
  for (const [productId, ratings] of byProduct) {
    const summary = aggregateRatings(ratings)
    if (summary) summaries.set(productId, summary)
  }
  return summaries
}
