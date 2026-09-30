import { CITIES, type City, cityBySlug } from '@/lib/geo/cities'
import { distanceKm } from '@/lib/geo/distance'
import type { ShippingMethodId } from '@/lib/shipping/methods'

/**
 * How long a supplier delivery is expected to take, by destination city.
 *
 * WHAT THIS IS AND IS NOT. The registry in `methods.ts` prices every method at
 * zero, and the reasons there still hold: `orders` has no column for a
 * shipping amount until 236 is applied, so a city cannot change the price. It
 * CAN change the wait, and "3-7 ימי עסקים" for the whole country is the
 * number the live site prints because it has nothing finer. This module has
 * the city table, so it narrows the band rather than inventing a fee.
 *
 * THE HUB IS TEL AVIV. Measured 2026-08-07, `suppliers.city` is filled for 5
 * of 11 live suppliers and `suppliers.address` for none, and the filled ones
 * cluster in the centre. Distance from the Tel Aviv municipal centre is the
 * honest resolution the data has, exactly as `geo/cities.ts` says of
 * "deals near me". A per-supplier origin can replace the hub the day the
 * address column is populated; the band edges below are the only thing that
 * would move.
 *
 * THE BANDS SIT INSIDE THE REGISTRY'S PROMISE. The method description says
 * 3-7 business days. Every band below is within that, so the estimate never
 * promises a delivery the method's own text does not.
 */

export type DeliveryEstimate = {
  city: City
  /** Business days, inclusive. */
  minDays: number
  maxDays: number
  /** The sentence a shopper reads, e.g. "3-5 ימי עסקים". */
  label: string
  /** Which band produced it, for the test and for anyone reading a log. */
  band: DeliveryBand
}

export type DeliveryBand = 'metro' | 'regional' | 'remote'

const HUB_SLUG = 'tel-aviv'

/** Upper edge of each band in kilometres from the hub, inclusive. */
export const DELIVERY_BANDS: readonly {
  band: DeliveryBand
  maxKm: number
  min: number
  max: number
}[] = [
  { band: 'metro', maxKm: 30, min: 3, max: 4 },
  { band: 'regional', maxKm: 130, min: 3, max: 5 },
  { band: 'remote', maxKm: Number.POSITIVE_INFINITY, min: 5, max: 7 },
]

function hub(): City {
  const city = cityBySlug(HUB_SLUG)
  // The hub is a member of CITIES by construction; the throw is for the day
  // someone renames the slug in one file and not the other.
  if (!city) throw new Error(`delivery estimate hub is not a known city: ${HUB_SLUG}`)
  return city
}

export function deliveryLabel(minDays: number, maxDays: number): string {
  return minDays === maxDays ? `${minDays} ימי עסקים` : `${minDays}-${maxDays} ימי עסקים`
}

/**
 * The estimate for a city, or null when there is nothing to estimate.
 *
 * Null for pickup, because nothing travels; null for an unknown slug, because
 * a guess for a city we cannot place is the "nearest guess" `cityByName`
 * refuses to make. A null renders as no sentence at all, never as a default
 * band dressed up as a fact.
 */
export function estimateDelivery(
  citySlug: string | null | undefined,
  methodId: ShippingMethodId,
): DeliveryEstimate | null {
  if (methodId !== 'supplier_delivery') return null
  const city = cityBySlug(citySlug)
  if (!city) return null

  const km = distanceKm(hub(), city)
  const band = DELIVERY_BANDS.find((entry) => km <= entry.maxKm) ?? DELIVERY_BANDS.at(-1)
  if (!band) throw new Error('delivery bands are empty')

  return {
    city,
    minDays: band.min,
    maxDays: band.max,
    label: deliveryLabel(band.min, band.max),
    band: band.band,
  }
}

/** The cities the selector offers, in the table's own order. */
export function deliveryCities(): readonly City[] {
  return CITIES
}
