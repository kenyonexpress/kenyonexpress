import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What a phase switch would actually do, counted before it is flipped.
 *
 * THE WHOLE REASON THIS EXISTS. [89] says phase 1 is coupons and phase 2 is
 * physical products. Measured on production, every one of the 44 active
 * products is `physical`, so turning phase 2 off empties the shop - and an
 * operator reading a screen that says "physical: phase 2, on" has no way to
 * know that. This puts the number next to the switch.
 *
 * The sales count is here for the same reason: [89] describes the toggle as
 * something the admin flips "after 10 sales". There have been 2. A screen that
 * names the condition and prints the current value turns a rule somebody has to
 * remember into one they can see.
 */

export type PhaseCounts = {
  /** Active, non-deleted products of this type. What a switch-off would hide. */
  activeByType: Record<string, number>
  /** Every non-deleted product, including drafts, for context. */
  totalByType: Record<string, number>
  /** Paid or later. [89]'s threshold is 10. */
  ordersSold: number
  ordersThreshold: number
}

export const PHASE_SALES_THRESHOLD = 10

export async function readPhaseCounts(): Promise<PhaseCounts> {
  const empty: PhaseCounts = {
    activeByType: {},
    totalByType: {},
    ordersSold: 0,
    ordersThreshold: PHASE_SALES_THRESHOLD,
  }

  const admin = createAdminClient()

  const { data: products, error: productError } = await admin
    .from('products')
    .select('type, status')
    .is('deleted_at', null)
    .limit(5000)

  if (productError) {
    log.error('admin.phase_counts_products_failed', { reason: productError.message })
    return empty
  }

  const activeByType: Record<string, number> = {}
  const totalByType: Record<string, number> = {}
  for (const row of products ?? []) {
    const type = String(row.type)
    totalByType[type] = (totalByType[type] ?? 0) + 1
    if (row.status === 'active') activeByType[type] = (activeByType[type] ?? 0) + 1
  }

  // `head: true` with an exact count: the number is the answer and the rows are
  // not, and this table is the one that grows.
  const { count, error: orderError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('status', ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled'])

  if (orderError) {
    log.warn('admin.phase_counts_orders_failed', { reason: orderError.message })
  }

  return {
    activeByType,
    totalByType,
    ordersSold: count ?? 0,
    ordersThreshold: PHASE_SALES_THRESHOLD,
  }
}
