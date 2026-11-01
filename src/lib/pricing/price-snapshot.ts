import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The daily price observation, shared by the two jobs that take it.
 *
 * `price_history` (migration 193) is the evidence behind every struck-through
 * price on the storefront: Israeli law asks what the product was actually
 * charged over the last thirty days, and `checkReferencePrice` answers from
 * these rows. A day with no observation is a hole in that window, and a hole
 * cannot be filled afterwards without inventing a price, which 193 refuses
 * to do.
 *
 * TWO JOBS WRITE THIS AND THAT IS DELIBERATE. `wishlist-alerts` snapshots at
 * 04:45 because it needs yesterday's price to detect a drop; `daily-deals`
 * snapshots at 03:00 because the observation IS the deal scrape. Either one
 * missing a run leaves the other to keep the window whole. The unique index
 * `price_history_observation_once` (product, day, price, reference, status)
 * makes the second writer a no-op rather than a duplicate, and the `seen`
 * check below keeps the second writer from even trying.
 *
 * Measured 2026-09-17 against production: 80 rows, the newest observed on
 * 2026-09-09. Eight days of the window were missing because nothing on this
 * branch was being called at 04:45.
 */

export interface SnapshotProduct {
  id: string
  status: string | null
  /** Generated twin of `kenyon_price`; null when the sticker price is unset. */
  kenyon_price_agorot: number | null
  /** Generated twin of `full_price`; the struck-through claim, if any. */
  full_price_agorot: number | null
}

export interface SnapshotResult {
  /** Rows inserted this run. */
  written: number
  /** Products already observed today at this price, left alone. */
  alreadyObserved: number
  /** Products with no sticker price, which cannot be observed. */
  unpriced: number
}

/** `YYYY-MM-DD` in Asia/Jerusalem, the calendar 193 files observations under. */
export function jerusalemDayKey(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

/**
 * Which of `products` still need an observation for `today`, given the rows
 * that already exist. Pure, so the skip rule can be tested without a database:
 * a product is observed once per day per price, and a price that moved during
 * the day is a second, legitimate observation.
 */
export function selectUnobserved<T extends SnapshotProduct>(
  products: readonly T[],
  existing: readonly { product_id: string; price_agorot: number }[],
): { rows: T[]; alreadyObserved: number; unpriced: number } {
  const seen = new Set(existing.map((row) => `${row.product_id}:${row.price_agorot}`))
  const rows: T[] = []
  let alreadyObserved = 0
  let unpriced = 0
  for (const product of products) {
    if (product.kenyon_price_agorot === null) {
      unpriced++
      continue
    }
    if (seen.has(`${product.id}:${product.kenyon_price_agorot}`)) {
      alreadyObserved++
      continue
    }
    rows.push(product)
  }
  return { rows, alreadyObserved, unpriced }
}

/**
 * Writes today's observation for every product that does not have one yet.
 *
 * Never throws: a failed snapshot is logged under `<job>.snapshot_failed` and
 * reported as zero written, because neither caller should fail its own duty
 * (the wishlist alerts, the flash deals) over a row that tomorrow's run will
 * write anyway. 23505 is a concurrent writer winning the same observation,
 * which is the unique index doing its job.
 */
export async function snapshotPrices(
  admin: SupabaseClient,
  products: readonly SnapshotProduct[],
  today: string,
  job: string,
): Promise<SnapshotResult> {
  const { data: existing, error: readError } = await admin
    .from('price_history' as never)
    .select('product_id, price_agorot')
    .eq('observed_on', today)
  if (readError) {
    log.warn(`${job}.snapshot_read_failed`, { reason: readError.message })
    return { written: 0, alreadyObserved: 0, unpriced: 0 }
  }

  const { rows, alreadyObserved, unpriced } = selectUnobserved(
    products,
    (existing ?? []) as unknown as { product_id: string; price_agorot: number }[],
  )
  if (rows.length === 0) return { written: 0, alreadyObserved, unpriced }

  const { error } = await admin.from('price_history' as never).insert(
    rows.map((p) => ({
      product_id: p.id,
      observed_on: today,
      price_agorot: p.kenyon_price_agorot,
      reference_agorot: p.full_price_agorot,
      status: p.status ?? 'unknown',
      source: 'snapshot',
    })) as never,
  )
  if (error && error.code !== '23505') {
    log.warn(`${job}.snapshot_failed`, { reason: error.message })
    return { written: 0, alreadyObserved, unpriced }
  }
  return { written: error ? 0 : rows.length, alreadyObserved, unpriced }
}
