import type { SupplierLocation } from '@/lib/geo/distance'

/**
 * The map on a coupon page, as URLs.
 *
 * The square is an OpenStreetMap embed: no API key, no script on our page,
 * and nothing loads unless the browser reaches the iframe (it is lazy). The
 * point it centres on is whatever `productLocation` answered, and the
 * PRECISION travels with it, because measured against production no supplier
 * has a coordinate and the map would otherwise present a city centre as the
 * door of the business. `precisionLabel` is the sentence under the map that
 * says which it is; a component that dropped it would be lying by omission.
 *
 * Pure, so the bbox arithmetic is tested without a browser. The origin is
 * pinned in `frame-policy.ts` (`frame-src`), and a second host here would be
 * a blank frame with a console violation, not a map.
 */

export const MERCHANT_MAP_ORIGIN = 'https://www.openstreetmap.org'

export interface MerchantMap {
  /** The iframe's src. */
  embedSrc: string
  /** A plain link to the same point on OpenStreetMap, for the no-iframe case. */
  osmHref: string
  /** Google Maps search on the same point. */
  googleMapsHref: string
  /** "מיקום מדויק" or "מיקום משוער לפי עיר", for the caption. */
  precisionLabel: string
  precision: 'exact' | 'city'
}

/**
 * Half the bbox edge, in degrees. Roughly 1km either way for a real
 * coordinate; a city-centre point gets the whole city.
 */
const HALF_EDGE: Record<'exact' | 'city', number> = { exact: 0.01, city: 0.06 }
const ZOOM: Record<'exact' | 'city', number> = { exact: 16, city: 12 }

const PRECISION_LABEL: Record<'exact' | 'city', string> = {
  exact: 'מיקום מדויק',
  city: 'מיקום משוער לפי עיר',
}

function fixed(value: number): string {
  return value.toFixed(5)
}

export function buildMerchantMap(location: SupplierLocation): MerchantMap | null {
  if (!location.coordinates || location.precision === 'unknown') return null
  const { lat, lng } = location.coordinates
  const precision = location.precision
  const half = HALF_EDGE[precision]

  const bbox = [lng - half, lat - half, lng + half, lat + half].map(fixed).join(',')
  const marker = `${fixed(lat)},${fixed(lng)}`

  const embed = new URL('/export/embed.html', MERCHANT_MAP_ORIGIN)
  embed.searchParams.set('bbox', bbox)
  embed.searchParams.set('layer', 'mapnik')
  embed.searchParams.set('marker', marker)

  const osm = new URL('/', MERCHANT_MAP_ORIGIN)
  osm.searchParams.set('mlat', fixed(lat))
  osm.searchParams.set('mlon', fixed(lng))
  osm.hash = `map=${ZOOM[precision]}/${fixed(lat)}/${fixed(lng)}`

  const google = new URL('https://www.google.com/maps/search/')
  google.searchParams.set('api', '1')
  google.searchParams.set('query', marker)

  return {
    embedSrc: embed.toString(),
    osmHref: osm.toString(),
    googleMapsHref: google.toString(),
    precisionLabel: PRECISION_LABEL[precision],
    precision,
  }
}
