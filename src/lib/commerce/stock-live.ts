import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The live stock read for a product page.
 *
 * WHY IT IS NOT IN THE CACHED PRODUCT LOAD. `loadProductBySlug` is a
 * `'use cache'` function with an hour's life, and that is correct for
 * everything it holds: names, prices and images do not move between requests.
 * Availability does. It changes every time somebody starts or abandons a
 * checkout, and a figure an hour old would let the page keep offering a unit
 * that another shopper is holding - which is the exact promise the reservation
 * exists to stop us making.
 *
 * WHY IT COSTS ALMOST NOTHING ANYWAY. It is skipped entirely for untracked
 * products, which is most of this catalogue: a product with no `stock_quantity`
 * has no scarcity to state and no reservation to subtract. Only a tracked
 * product pays for one indexed RPC.
 *
 * WHY THE ADMIN CLIENT. `available_stock` is granted to `anon` as well, but the
 * reservations it sums are behind RLS with no public policy at all - a shopper
 * must not be able to enumerate what other people are buying. The function is
 * SECURITY DEFINER so either client returns the same number; the admin client
 * is used because the page already has one and it avoids a second connection.
 *
 * NEVER THROWS. A product page that 500s because a stock counter was
 * unreachable is worse than a product page that omits a scarcity badge.
 */

export interface LiveStock {
  /** The level minus live holds, or null when the product is untracked. */
  available: number | null
  initial: number | null
  threshold: number | null
}

export const UNTRACKED_STOCK: LiveStock = { available: null, initial: null, threshold: null }

export async function readLiveStock(
  productId: string,
  trackedLevel: number | null | undefined,
): Promise<LiveStock> {
  // The cached level is only used as a CHEAP TEST FOR "is this tracked at all".
  // Its value is stale and is never shown; the number the page displays comes
  // from the RPC below.
  if (trackedLevel === null || trackedLevel === undefined) return UNTRACKED_STOCK

  try {
    const admin = createAdminClient()
    const [{ data: available, error }, { data: row }] = await Promise.all([
      admin.rpc('available_stock', { p_product_id: productId }),
      admin
        .from('products')
        .select('stock_initial, low_stock_threshold')
        .eq('id', productId)
        .maybeSingle(),
    ])

    if (error) {
      log.warn('stock.available_read_failed', { productId, reason: error.message })
      return UNTRACKED_STOCK
    }

    const meta = row as { stock_initial: number | null; low_stock_threshold: number | null } | null
    return {
      available: typeof available === 'number' ? available : null,
      initial: meta?.stock_initial ?? null,
      threshold: meta?.low_stock_threshold ?? null,
    }
  } catch (error) {
    log.warn('stock.available_read_threw', {
      productId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return UNTRACKED_STOCK
  }
}
