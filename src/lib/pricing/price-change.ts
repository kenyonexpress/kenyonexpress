import { catalogueIlsToAgorot } from '@/lib/admin/bulk-price'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jerusalemDayKey } from './price-snapshot'

/**
 * The `source = 'change'` observation an admin price edit leaves in
 * `price_history` (193), STEP 59.
 *
 * WHY THE EDITOR WRITES IT AND DOES NOT WAIT FOR THE CRON. The two snapshot
 * jobs observe once a day, at 03:00 and 04:45. A price lowered at 10:00 and
 * raised back at 18:00 would leave no row at all, and the next morning's
 * "price dropped" badge, the chart and the thirty-day reference check would
 * all be reasoning over a day that never happened. 201 closed this gap for
 * flash deals (`flash-deals.ts` writes the same row); this closes it for the
 * product editor and the bulk price tool.
 *
 * Pending migration 264 adds a trigger on `products` that writes the same row
 * from inside the database, which also covers CSV imports and SQL fixes.
 * Both writers land on `price_history_observation_once`, so when the trigger
 * is live this insert is a 23505 that the code below treats as success. The
 * two are deliberately redundant until 264 is applied, and harmless after.
 *
 * SERVICE ROLE, BY NECESSITY. 193 grants no INSERT to `authenticated`: the
 * admin's own session cannot write evidence, only the server can.
 *
 * Never throws. The product is already saved; a missing observation is a
 * logged gap the daily snapshot narrows to one day, not a reason to show the
 * admin an error over a save that worked.
 */

export interface PriceSnapshotInput {
  /** The sticker price in force AFTER the write, catalogue shekels. */
  kenyon_price: number | string | null | undefined
  /** The struck-through claim AFTER the write, catalogue shekels. */
  full_price: number | string | null | undefined
}

/**
 * A catalogue price to agorot, with "no price" kept apart from "zero": the
 * form sends `null` for an empty field and `catalogueIlsToAgorot` would read
 * that as 0.
 */
function toAgorot(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  return catalogueIlsToAgorot(value)
}

/**
 * Whether a save moved either price, compared in integer agorot so `100` and
 * `100.00` are the same price and `99.995` is not a change nobody can see.
 */
export function priceChanged(before: PriceSnapshotInput, after: PriceSnapshotInput): boolean {
  return (
    toAgorot(before.kenyon_price) !== toAgorot(after.kenyon_price) ||
    toAgorot(before.full_price) !== toAgorot(after.full_price)
  )
}

export interface RecordPriceChangeInput {
  productId: string
  kenyon_price: number | string | null | undefined
  full_price: number | string | null | undefined
  status: string | null | undefined
}

export type RecordPriceChangeResult = 'written' | 'exists' | 'unpriced' | 'failed'

export async function recordPriceChange(
  admin: SupabaseClient,
  input: RecordPriceChangeInput,
  now: Date = new Date(),
): Promise<RecordPriceChangeResult> {
  const priceAgorot = toAgorot(input.kenyon_price)
  if (priceAgorot === null) return 'unpriced'
  const referenceAgorot = toAgorot(input.full_price)

  const { error } = await admin.from('price_history' as never).insert({
    product_id: input.productId,
    observed_on: jerusalemDayKey(now),
    price_agorot: priceAgorot,
    reference_agorot: referenceAgorot,
    status: input.status ?? 'unknown',
    source: 'change',
  } as never)
  if (!error) return 'written'
  if (error.code === '23505') return 'exists'
  log.warn('price_history.change_write_failed', {
    productId: input.productId,
    reason: error.message,
  })
  return 'failed'
}
