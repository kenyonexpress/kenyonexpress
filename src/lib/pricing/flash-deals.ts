import { agorotToIls } from '@/lib/commerce/money'
import { agorot, divRoundHalfUp } from '@/lib/money'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Flash deals and the day's deal set.
 *
 * TWO HALVES. `applyDueScheduledPriceChanges` moves prices whose moment has
 * come (`scheduled_price_changes`, migration 201, live in production and
 * empty as of 2026-09-17; nothing on this branch applied its rows until now).
 * `rankDeals` is the pure half: given the catalogue, which products are a
 * deal today and in what order. It decides from the two price columns alone,
 * so a test can hand it rows and read the answer.
 *
 * A DUE ROW IN THE PAST IS STILL DUE. The query is `effective_at <= now`,
 * not a window: a run that was missed catches up rather than skips, because
 * a flash deal nobody ran is a promise on a marketing email the site did not
 * keep, and the customer arriving to find the old price does not know a cron
 * failed.
 *
 * EVERY APPLIED CHANGE WRITES `price_history` WITH `source = 'change'`. That
 * is this module's whole duty to pricing compliance: 193 created that value
 * for exactly this, and without it a deal that opened at 10:00 and closed at
 * 18:00 would leave no trace in the thirty-day window the law asks about.
 * It does NOT refuse a change on compliance grounds. Israeli law constrains
 * the "before" price, not the price; lowering is always lawful, and
 * `checkReferencePrice` works out from these rows what claim is still
 * defensible afterwards.
 *
 * WHICH COLUMNS ARE WRITTEN. On the hosted database `kenyon_price_agorot` and
 * `full_price_agorot` are GENERATED from `kenyon_price` / `full_price`
 * (numeric ILS), measured 2026-09-17 via information_schema. A write to the
 * agorot twin is an error there, so the ILS source columns are written, and
 * the one conversion goes through `agorotToIls`, the same helper finalize
 * uses for `fn_wallet_transfer`. The integer agorot from the schedule row is
 * what lands in `price_history`, untouched.
 */

export interface DealCandidate {
  id: string
  slug: string | null
  name_he: string | null
  status: string | null
  stock_quantity: number | null
  kenyon_price_agorot: number | null
  full_price_agorot: number | null
}

export interface RankedDeal {
  id: string
  slug: string | null
  nameHe: string | null
  priceAgorot: number
  referenceAgorot: number
  /** Basis points off the reference, integer half-up. 2500 is 25% off. */
  discountBp: number
}

/** The homepage grid holds 32 cards; the day's set is sized to match. */
export const DAILY_DEAL_LIMIT = 32

/**
 * The day's deals: active, in stock (or untracked), with a reference price
 * strictly above the sticker. Deepest discount first, then cheaper first,
 * then id, so two runs over the same catalogue produce the same list.
 *
 * `discount_percent` on the product row is NOT consulted. It is an operator's
 * typed claim; the two prices are what the customer is actually shown, and a
 * deal set built from the claim would list products whose badge says -30%
 * and whose prices say nothing.
 */
export function rankDeals(
  products: readonly DealCandidate[],
  limit: number = DAILY_DEAL_LIMIT,
): RankedDeal[] {
  const deals: RankedDeal[] = []
  for (const p of products) {
    if (p.status !== 'active') continue
    if (p.stock_quantity !== null && p.stock_quantity <= 0) continue
    if (p.kenyon_price_agorot === null || p.full_price_agorot === null) continue
    if (!Number.isSafeInteger(p.kenyon_price_agorot) || !Number.isSafeInteger(p.full_price_agorot))
      continue
    if (p.kenyon_price_agorot < 0 || p.full_price_agorot <= p.kenyon_price_agorot) continue
    const off = p.full_price_agorot - p.kenyon_price_agorot
    deals.push({
      id: p.id,
      slug: p.slug,
      nameHe: p.name_he,
      priceAgorot: p.kenyon_price_agorot,
      referenceAgorot: p.full_price_agorot,
      discountBp: divRoundHalfUp(off * 10_000, p.full_price_agorot),
    })
  }
  deals.sort(
    (a, b) =>
      b.discountBp - a.discountBp || a.priceAgorot - b.priceAgorot || a.id.localeCompare(b.id),
  )
  return deals.slice(0, Math.max(0, limit))
}

export interface ScheduledChangeRow {
  id: string
  product_id: string
  effective_at: string
  price_agorot: number
  reference_agorot: number | null
}

export interface ApplyResult {
  /** Due rows the query returned. */
  due: number
  /** Rows whose price landed and whose history row was written. */
  applied: number
  /** Rows left unapplied with `last_error` set; retried next run. */
  failed: number
  /** Product ids whose price moved, for cache invalidation. */
  productIds: string[]
}

/**
 * Applies every scheduled change whose time has passed, oldest first, up to
 * `batch`. A backlog drains over consecutive runs.
 *
 * Per row: read the product (its status and current reference are what the
 * history row records when the change leaves the reference alone), write the
 * price, write the observation, stamp `applied_at`. A failure at any step
 * writes `last_error` and leaves `applied_at` null, so the row is picked up
 * again tomorrow with the reason visible to an operator meanwhile. One bad
 * row never stops the rest of the batch.
 */
export async function applyDueScheduledPriceChanges(
  admin: SupabaseClient,
  options: { now: Date; today: string; batch?: number },
): Promise<ApplyResult> {
  const batch = options.batch ?? 100
  const { data, error } = await admin
    .from('scheduled_price_changes' as never)
    .select('id, product_id, effective_at, price_agorot, reference_agorot')
    .is('applied_at', null)
    .is('cancelled_at', null)
    .lte('effective_at', options.now.toISOString())
    .order('effective_at', { ascending: true })
    .limit(batch)
  if (error) throw new Error(`scheduled_price_changes read failed: ${error.message}`)

  const rows = (data ?? []) as unknown as ScheduledChangeRow[]
  const result: ApplyResult = { due: rows.length, applied: 0, failed: 0, productIds: [] }

  for (const change of rows) {
    try {
      await applyOne(admin, change, options.today, options.now)
      result.applied++
      result.productIds.push(change.product_id)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      result.failed++
      log.error('flash_deals.apply_failed', {
        changeId: change.id,
        productId: change.product_id,
        reason,
      })
      await admin
        .from('scheduled_price_changes' as never)
        .update({ last_error: reason.slice(0, 500) } as never)
        .eq('id', change.id)
    }
  }
  return result
}

async function applyOne(
  admin: SupabaseClient,
  change: ScheduledChangeRow,
  today: string,
  now: Date,
): Promise<void> {
  if (!Number.isSafeInteger(change.price_agorot) || change.price_agorot < 0) {
    throw new Error(`price_agorot ${change.price_agorot} is not a non-negative integer`)
  }
  if (
    change.reference_agorot !== null &&
    (!Number.isSafeInteger(change.reference_agorot) || change.reference_agorot < 0)
  ) {
    throw new Error(`reference_agorot ${change.reference_agorot} is not a non-negative integer`)
  }

  const { data: product, error: productError } = await admin
    .from('products')
    .select('id, status, full_price_agorot, deleted_at')
    .eq('id', change.product_id)
    .maybeSingle()
  if (productError) throw new Error(`product read failed: ${productError.message}`)
  if (!product) throw new Error('product not found')
  if (product.deleted_at) throw new Error('product is deleted')

  const patch: Record<string, number> = { kenyon_price: agorotToIls(agorot(change.price_agorot)) }
  if (change.reference_agorot !== null) {
    patch.full_price = agorotToIls(agorot(change.reference_agorot))
  }
  const { error: writeError } = await admin
    .from('products')
    .update(patch as never)
    .eq('id', change.product_id)
  if (writeError) throw new Error(`price write failed: ${writeError.message}`)

  // The observation, with the reference that is in force AFTER the change:
  // the one the row set, or the one the product already carried.
  const { error: historyError } = await admin.from('price_history' as never).insert({
    product_id: change.product_id,
    observed_on: today,
    price_agorot: change.price_agorot,
    reference_agorot: change.reference_agorot ?? product.full_price_agorot ?? null,
    status: product.status ?? 'unknown',
    source: 'change',
  } as never)
  // 23505: this exact observation already exists today (a rerun after the
  // stamp below failed). The evidence is there, which is what matters.
  if (historyError && historyError.code !== '23505') {
    throw new Error(`price_history write failed: ${historyError.message}`)
  }

  const { error: stampError } = await admin
    .from('scheduled_price_changes' as never)
    .update({ applied_at: now.toISOString(), last_error: null } as never)
    .eq('id', change.id)
  if (stampError) throw new Error(`applied_at stamp failed: ${stampError.message}`)
}
