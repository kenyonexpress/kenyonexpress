import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { log } from '@/lib/observability/log'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Which product types this shop is currently selling.
 *
 * =========================================================================
 * THE MEASUREMENT THAT SHAPES THIS FILE
 * =========================================================================
 *
 * [89] assigns coupons to phase 1 and physical products to phase 2, and asks
 * for the second to be off until the admin turns it on. Read off production on
 * 2026-09-09:
 *
 *   coupon    draft    15        orders total 4, of which sold 2
 *   physical  active   44        vouchers 0
 *   physical  draft    21
 *
 * EVERY ACTIVE PRODUCT ON THIS SITE IS `physical`. Shipping phase 1 as written
 * would hide 44 of 44 and leave an empty shop, and there is not one active
 * coupon to put in its place. So `210_product_phases.sql` seeds every type
 * ENABLED and keeps the phase number as advice next to the switch, and the
 * admin screen prints how many active products a switch would hide before it is
 * flipped.
 *
 * =========================================================================
 * IT FAILS OPEN, AND THAT IS THE UNCOMFORTABLE HALF
 * =========================================================================
 *
 * If the read fails - 210 unapplied, database unreachable, a row missing for a
 * type the enum has - every type is treated as sellable and the catalogue is
 * unchanged.
 *
 * Failing closed would mean a transient database error empties the shop, and an
 * empty shop is indistinguishable from a shop with nothing to sell: no error
 * page, no alert, just a catalogue that says "no products match". That is the
 * exact failure `catalogue-read.ts` was written about, where one transient
 * failure was cached as an empty shop for an hour.
 *
 * The cost of failing open is bounded and is stated: for the length of one
 * cache period, a type the operator turned off could be listed again. It cannot
 * be BOUGHT - `assertTypeSellable` is called by the cart on a live read, and a
 * failure there is a refusal, because refusing one add to cart is cheap and
 * selling something the operator withdrew is not.
 */

/** Every value of the `product_type` enum, plus the ones 91 and 92 will add. */
export type PhaseProductType = string

export type PhaseRow = {
  productType: string
  phase: number
  isEnabled: boolean
  enabledAt: string | null
  note: string | null
}

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

let notAppliedReported = false

function notApplied(error: { code?: string } | null | undefined): boolean {
  if (!error || !MISSING.has(error.code ?? '')) return false
  if (!notAppliedReported) {
    notAppliedReported = true
    log.info('phases.not_applied', { migration: '210_product_phases.sql' })
  }
  return true
}

/**
 * The whole table, cached.
 *
 * Anon, because `phase_config` is publicly readable by design: which product
 * types a shop sells is visible by looking at the shop. Tagged with
 * `CATALOGUE_TAG`, so flipping a switch in the admin refreshes the catalogue
 * with everything else.
 *
 * Returns null - not an empty list - when it could not read. The difference is
 * the whole of the fail-open rule: an empty list would mean "nothing is
 * sellable", and null means "no opinion".
 */
async function readPhaseRows(): Promise<PhaseRow[] | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('phase_config' as never)
      .select('product_type, phase, is_enabled, enabled_at, note')

    if (error) {
      if (!notApplied(error)) log.warn('phases.read_failed', { reason: error.message })
      return null
    }
    const rows = (data ?? []) as unknown as {
      product_type: string
      phase: number
      is_enabled: boolean
      enabled_at: string | null
      note: string | null
    }[]
    // An EMPTY table is not "nothing is sellable". It is a table nobody seeded,
    // which is the same state as one that does not exist.
    if (rows.length === 0) return null

    return rows.map((row) => ({
      productType: row.product_type,
      phase: row.phase,
      isEnabled: row.is_enabled,
      enabledAt: row.enabled_at,
      note: row.note,
    }))
  } catch (error) {
    log.warn('phases.read_threw', { err: error })
    return null
  }
}

/**
 * The types a shopper may see and buy, or null for "no opinion".
 *
 * Null is what every caller checks first, and it is why this returns a union
 * rather than a list with a sensible default: a caller that treated null as an
 * empty list would filter the catalogue down to nothing on a failed read, which
 * is precisely the failure the header rules out.
 */
export async function enabledProductTypes(): Promise<string[] | null> {
  const rows = await readPhaseRows()
  if (!rows) return null
  return rows.filter((row) => row.isEnabled).map((row) => row.productType)
}

/**
 * Whether one type is sellable, given the list.
 *
 * Pure, so the catalogue filter, the cart guard and the admin screen cannot
 * disagree.
 *
 * A TYPE WITH NO ROW IS NOT SELLABLE, and that is the one place this file does
 * not fail open. 210 seeds a row per enum value, and 91 and 92 seed their new
 * types DISABLED before the enum has them - so a type with no row is one nobody
 * has approved, and listing it would mean a new product type goes on sale the
 * moment somebody adds it to the enum. The failure this protects against is the
 * opposite of an empty shop: a full one, selling something nobody decided to
 * sell.
 *
 * A failed READ is still `null` and still lists everything. The distinction is
 * between "the config says nothing about this type" and "there is no config".
 */
export function isTypeSellable(type: string | null | undefined, enabled: string[] | null): boolean {
  if (enabled === null) return true
  if (!type) return true
  return enabled.includes(type)
}

/**
 * The cart's guard. Reads live rather than from the cached list.
 *
 * NOT the cached read, deliberately. The catalogue may list a withdrawn type
 * for up to a cache period, and that is an accepted cost; adding it to a cart
 * is the point at which the shop would be taking money for it, and an hour-old
 * answer is not good enough there.
 *
 * A FAILED READ REFUSES here, which is the opposite of the listing path.
 * Refusing one add to cart costs a shopper a retry; selling something the
 * operator withdrew costs a refund and an apology.
 */
export async function assertTypeSellable(type: string | null | undefined): Promise<boolean> {
  if (!type) return true

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('phase_config' as never)
      .select('is_enabled')
      .eq('product_type', type)
      .maybeSingle()

    // 210 unapplied is not a failure: it is the state of this database today,
    // and every type is sellable in it.
    if (error) return notApplied(error)
    // No row means a type nobody has approved. Same rule as `isTypeSellable`,
    // and it has to be the same or the catalogue and the cart disagree about
    // what the shop sells.
    if (!data) return false
    return (data as unknown as { is_enabled: boolean }).is_enabled
  } catch (error) {
    log.warn('phases.assert_threw', { err: error })
    return false
  }
}

/**
 * Every row, for the admin screen.
 *
 * ITS OWN READ, NOT `readPhaseRows`, and uncached. The storefront's copy lives
 * inside a `use cache` scope with an hour's life, so a console that shared it
 * would show an operator the state from before their own save - which reads
 * exactly like the save having failed, and is the bug `catalogue-cache.ts`
 * documents at length for products.
 */
export async function readPhaseConfigForAdmin(): Promise<PhaseRow[] | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('phase_config' as never)
    .select('product_type, phase, is_enabled, enabled_at, note')
    .order('phase', { ascending: true })
    .order('product_type', { ascending: true })

  if (error) {
    if (!notApplied(error)) log.error('phases.admin_read_failed', { reason: error.message })
    return null
  }
  const rows = (data ?? []) as unknown as {
    product_type: string
    phase: number
    is_enabled: boolean
    enabled_at: string | null
    note: string | null
  }[]
  return rows.map((row) => ({
    productType: row.product_type,
    phase: row.phase,
    isEnabled: row.is_enabled,
    enabledAt: row.enabled_at,
    note: row.note,
  }))
}

/** Test seam. Never called by application code. */
export function __resetPhaseWarning(): void {
  notAppliedReported = false
}
