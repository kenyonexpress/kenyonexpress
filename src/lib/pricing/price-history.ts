import 'server-only'

import { type Agorot, agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type PriceObservation,
  REFERENCE_WINDOW_DAYS,
  type ReferenceVerdict,
  checkReferencePrice,
  mayShowReference,
} from './reference-price'

/**
 * Reading `price_history`, and surviving its absence.
 *
 * `migrations/pending/193_price_history.sql` is written and NOT applied, which
 * is the standing rule for anything that touches production. So on the day this
 * ships, every read below fails with "relation does not exist" and every
 * product comes back `unproven` -- which is exactly what it is. Nothing here
 * throws, nothing 500s, and no page loses a price because a table is missing.
 *
 * The failure is said ONCE PER PROCESS, not once per product and not once per
 * request. A missing table on a catalogue page would otherwise log 24 identical
 * lines per view, which is how a log stops being read. Same shape the coupon
 * and abandoned-cart routes use for `PGRST205` and `42703`.
 *
 * WHY THE READ IS BATCHED. A grid renders up to 24 products. One query per card
 * is 24 round trips to answer one question, and it is the shape that made the
 * product page take 1.2s in the load test. `loadReferenceVerdicts` takes a list
 * and issues one query.
 */

/** Postgres and PostgREST for "that table is not there". */
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204'])

let absenceReported = false

function isMissingTable(error: { code?: string | null; message?: string } | null): boolean {
  if (!error) return false
  if (error.code && MISSING_TABLE.has(error.code)) return true
  return /relation .*price_history.* does not exist/i.test(error.message ?? '')
}

/** The calendar day in Asia/Jerusalem, `YYYY-MM-DD`. */
export function israeliDay(now: Date = new Date()): string {
  // `en-CA` because it formats as YYYY-MM-DD, which is the shape `date` columns
  // and the pure checker both take. Building it from getFullYear/getMonth would
  // read the SERVER's timezone, and the server runs in UTC: at 02:00 Israeli
  // time that is still yesterday, and a snapshot filed under yesterday leaves a
  // hole in the window that nothing would report.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

type HistoryRow = {
  product_id: string
  observed_on: string
  price_agorot: number
  status: string
}

export interface ReferenceInput {
  productId: string
  currentAgorot: Agorot
  referenceAgorot: Agorot | null
}

/**
 * A verdict per product, keyed by id.
 *
 * Products with no row in the result get `unproven / no_history`, which is the
 * same answer as an empty history and the same answer as a missing table. That
 * is deliberate: all three mean "the record cannot support this claim", and a
 * caller that had to tell them apart would end up with three branches that do
 * the same thing.
 */
export async function loadReferenceVerdicts(
  supabase: SupabaseClient,
  products: readonly ReferenceInput[],
  now: Date = new Date(),
): Promise<Map<string, ReferenceVerdict>> {
  const windowEndsOn = israeliDay(now)
  const verdicts = new Map<string, ReferenceVerdict>()
  if (products.length === 0) return verdicts

  const windowStart = new Date(now.getTime() - (REFERENCE_WINDOW_DAYS - 1) * 86_400_000)
  const observations = new Map<string, PriceObservation[]>()

  const { data, error } = await supabase
    .from('price_history')
    .select('product_id, observed_on, price_agorot, status')
    .in(
      'product_id',
      products.map((p) => p.productId),
    )
    .gte('observed_on', israeliDay(windowStart))
    // A day the product was not on sale is not a day it had a price. Without
    // this a product could be hidden for a month and come back advertising any
    // "before" price at all, with a full window of draft days behind it.
    .eq('status', 'active')

  if (error && !isMissingTable(error)) {
    log.warn('pricing.history_read_failed', { reason: error.message })
  } else if (error) {
    if (!absenceReported) {
      absenceReported = true
      log.warn('pricing.history_absent', {
        detail: 'price_history is not in this database; 193 is written and unapplied.',
      })
    }
  } else {
    for (const row of (data ?? []) as HistoryRow[]) {
      const list = observations.get(row.product_id)
      const observation = {
        observedOn: row.observed_on,
        priceAgorot: agorot(row.price_agorot),
      }
      if (list) list.push(observation)
      else observations.set(row.product_id, [observation])
    }
  }

  for (const product of products) {
    verdicts.set(
      product.productId,
      checkReferencePrice({
        currentAgorot: product.currentAgorot,
        referenceAgorot: product.referenceAgorot,
        observations: observations.get(product.productId) ?? [],
        windowEndsOn,
      }),
    )
  }

  return verdicts
}

/**
 * The reference price a surface may paint, in ILS, or null.
 *
 * Returns ILS rather than agorot because that is what every price component
 * already takes. The check itself runs entirely in agorot; this is the last
 * step, and it divides rather than rounds.
 */
export function permittedReferenceIls(verdict: ReferenceVerdict | undefined): number | null {
  if (!verdict || !mayShowReference(verdict)) return null
  if (verdict.kind === 'compliant') return verdict.referenceAgorot / 100
  // `unproven` carries no amount of its own -- there is nothing to carry, which
  // is the point of the verdict. The caller keeps the claim it already had.
  return null
}

/**
 * Should this surface suppress the "before" price it was about to render?
 *
 * The question is phrased as suppression rather than permission on purpose. A
 * caller that forgets to ask keeps today's behaviour, so adding this to a
 * surface can only ever remove a false claim and never blank a true one by
 * accident.
 */
export function suppressReference(verdict: ReferenceVerdict | undefined): boolean {
  return verdict?.kind === 'violating'
}
