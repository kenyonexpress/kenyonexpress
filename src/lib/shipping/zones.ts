import { type City, cityByName, cityBySlug } from '@/lib/geo/cities'
import { distanceKm } from '@/lib/geo/distance'
import { type Agorot, agorot } from '@/lib/money'

/**
 * The zone policy: what a destination costs the SHOPPER.
 *
 * `shipping_zones` (197, live in production since 2026-09-09) holds one row
 * per zone with a flat rate and a free-above threshold, seeded free
 * everywhere because the banner on every page says so. 197's header named
 * this file as the reader; nothing read the table until STEP 43. The carrier
 * quote is a different number (what the courier bills the platform) and never
 * reaches the shopper directly; `quote.ts` folds the two together.
 *
 * The zone of a city is resolved from the city table and the distance to the
 * Tel Aviv hub, the same resolution `estimate.ts` already uses for the
 * delivery band. Eilat and the Arava are named, not measured: every courier
 * prices them apart and the row exists for exactly that.
 */

export type ZoneId = 'center' | 'north' | 'south' | 'eilat' | 'remote'

export interface ZonePolicy {
  id: ZoneId
  nameHe: string
  flatAgorot: Agorot
  /** null: never free. 0: free from the first agora. */
  freeAboveAgorot: Agorot | null
  deliverable: boolean
}

/** Exactly 197's seed. Used when the table cannot be read, so the fallback is the deployed policy and not a guess. */
export const ZONE_SEED: readonly ZonePolicy[] = [
  {
    id: 'center',
    nameHe: 'מרכז',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'north',
    nameHe: 'צפון',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'south',
    nameHe: 'דרום',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'eilat',
    nameHe: 'אילת והערבה',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
  {
    id: 'remote',
    nameHe: 'אזור מרוחק',
    flatAgorot: agorot(0),
    freeAboveAgorot: agorot(0),
    deliverable: true,
  },
]

const HUB_SLUG = 'tel-aviv'
const EILAT_SLUGS = new Set(['eilat'])
const SOUTH_LAT_MAX = 31.6
const NORTH_LAT_MIN = 32.4
const CENTER_RADIUS_KM = 45
const REMOTE_RADIUS_KM = 170

export function isZoneId(value: unknown): value is ZoneId {
  return (
    typeof value === 'string' && ['center', 'north', 'south', 'eilat', 'remote'].includes(value)
  )
}

/**
 * The zone a known city falls in. Null for a city the table does not know:
 * a guess here would price a parcel to a place we cannot place.
 */
export function zoneForCity(city: City | null): ZoneId | null {
  if (!city) return null
  if (EILAT_SLUGS.has(city.slug)) return 'eilat'
  const hub = cityBySlug(HUB_SLUG)
  if (!hub) throw new Error(`zone hub is not a known city: ${HUB_SLUG}`)
  const km = distanceKm(hub, city)
  if (km <= CENTER_RADIUS_KM) return 'center'
  if (km > REMOTE_RADIUS_KM) return 'remote'
  if (city.lat <= SOUTH_LAT_MAX) return 'south'
  if (city.lat >= NORTH_LAT_MIN) return 'north'
  return 'center'
}

/** Convenience over a typed city name (what the checkout form holds). */
export function zoneForCityName(name: string | null | undefined): ZoneId | null {
  return zoneForCity(cityByName(name))
}

/**
 * What the shopper pays for this zone at this subtotal. Integer agorot, no
 * division anywhere: the policy is a flat rate and a threshold.
 */
export function shopperShippingAgorot(policy: ZonePolicy, subtotalAgorot: Agorot): Agorot {
  if (policy.freeAboveAgorot !== null && subtotalAgorot >= policy.freeAboveAgorot) {
    return agorot(0)
  }
  return policy.flatAgorot
}

export interface ZoneRowLike {
  id: string
  name_he: string
  flat_agorot: number | string
  free_above_agorot: number | string | null
  deliverable: boolean
}

/** Rows as PostgREST returns them (bigint arrives as a number or a string) into policies; unknown ids are dropped. */
export function policiesFromRows(rows: readonly ZoneRowLike[]): ZonePolicy[] {
  const out: ZonePolicy[] = []
  for (const row of rows) {
    if (!isZoneId(row.id)) continue
    const flat = Number(row.flat_agorot)
    const free = row.free_above_agorot === null ? null : Number(row.free_above_agorot)
    if (!Number.isInteger(flat) || flat < 0) continue
    if (free !== null && (!Number.isInteger(free) || free < 0)) continue
    out.push({
      id: row.id,
      nameHe: row.name_he,
      flatAgorot: agorot(flat),
      freeAboveAgorot: free === null ? null : agorot(free),
      deliverable: Boolean(row.deliverable),
    })
  }
  return out
}

/** The policy for a zone from a list, falling back to the seed row of the same id. */
export function policyFor(zone: ZoneId, policies: readonly ZonePolicy[]): ZonePolicy {
  const found = policies.find((p) => p.id === zone) ?? ZONE_SEED.find((p) => p.id === zone)
  if (!found) throw new Error(`zone seed has no row for ${zone}`)
  return found
}
