import { type Agorot, agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { type ShippingEnv, loadShippingEnv } from '@/lib/shipping/env'
import { offeredCarrierProviders } from '@/lib/shipping/providers'
import type { CarrierProvider, CarrierQuote } from '@/lib/shipping/providers/types'
import {
  type ShippingOption,
  buildShippingOptions,
  declaredValueAgorot,
  estimateParcelWeightGrams,
} from '@/lib/shipping/quote'
import {
  ZONE_SEED,
  type ZoneId,
  type ZonePolicy,
  type ZoneRowLike,
  policiesFromRows,
  policyFor,
  zoneForCityName,
} from '@/lib/shipping/zones'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * The checkout quote: zone row, parcel estimate, every offered carrier asked
 * in parallel, folded into the options the radio renders.
 *
 * A carrier that fails is dropped and logged, never surfaced as an error:
 * the shopper is choosing a courier for a free delivery, and a courier that
 * is down is a courier not offered. When every carrier fails the result is
 * an empty list and `degraded: true`, and the form says the courier will be
 * chosen when the parcel is prepared, which is exactly what happened before
 * this step existed.
 */

type AdminClient = ReturnType<typeof createAdminClient>

/** Postgres undefined_table, and PostgREST's schema-cache equivalent. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export interface CheckoutQuoteLine {
  quantity: number
  weightGrams: number | null
  lineTotalAgorot: Agorot
}

export interface CheckoutQuoteInput {
  cityName: string | null
  zip: string | null
  lines: readonly CheckoutQuoteLine[]
}

export interface CheckoutQuoteResult {
  zone: ZoneId | null
  options: ShippingOption[]
  /** True when at least one offered carrier could not be quoted. */
  degraded: boolean
  weightGrams: number
}

/** The live zone rows, or 197's seed when the table cannot be read. */
export async function readZonePolicies(admin: AdminClient): Promise<ZonePolicy[]> {
  const { data, error } = await admin
    .from('shipping_zones' as never)
    .select('id, name_he, flat_agorot, free_above_agorot, deliverable')
  if (error) {
    if (!MISSING_TABLE.has(error.code ?? '')) {
      log.warn('shipping.zones_read_failed', { reason: error.message })
    }
    return [...ZONE_SEED]
  }
  const rows = (data ?? []) as unknown as ZoneRowLike[]
  const policies = policiesFromRows(rows)
  return policies.length > 0 ? policies : [...ZONE_SEED]
}

export async function quoteCheckoutOptions(
  admin: AdminClient,
  input: CheckoutQuoteInput,
  deps: { env?: ShippingEnv; providers?: CarrierProvider[] } = {},
): Promise<CheckoutQuoteResult> {
  const env = deps.env ?? loadShippingEnv()
  const providers = deps.providers ?? offeredCarrierProviders(env)
  const zone = zoneForCityName(input.cityName)
  const policies = await readZonePolicies(admin)
  // An unknown city is priced as the centre: the free default, and the band
  // every carrier's default service already promises nationwide.
  const policy = policyFor(zone ?? 'center', policies)

  const weightGrams = estimateParcelWeightGrams(input.lines)
  const parcel = {
    weightGrams,
    declaredValueAgorot: declaredValueAgorot(input.lines.map((l) => l.lineTotalAgorot)),
    pieces: Math.max(
      1,
      input.lines.reduce((n, l) => n + Math.max(0, Math.trunc(l.quantity)), 0),
    ),
  }
  const destination = { city: input.cityName ?? '', zip: input.zip }

  const settled = await Promise.allSettled(
    providers.map((p) => p.quote({ carrierId: p.carrierId, destination, parcel })),
  )
  const quotes: CarrierQuote[] = []
  let degraded = false
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      quotes.push(...result.value)
      return
    }
    degraded = true
    log.warn('shipping.quote_failed', {
      carrier: providers[i]?.carrierId ?? 'unknown',
      reason: result.reason instanceof Error ? result.reason.message : 'unknown',
    })
  })

  const subtotalAgorot = agorot(input.lines.reduce<number>((s, l) => s + l.lineTotalAgorot, 0))
  const options = buildShippingOptions({ quotes, zone, policy, subtotalAgorot })
  return { zone, options, degraded, weightGrams }
}
