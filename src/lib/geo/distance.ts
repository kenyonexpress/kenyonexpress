/**
 * Distance between two points, and sorting deals by it.
 *
 * Pure: no clock, no database, no `navigator`. The browser's geolocation call
 * lives in the component that needs it and hands a coordinate in here, so this
 * module is testable and so the sort cannot differ between the server and the
 * client.
 */

import { type City, cityByName } from './cities'

export interface Coordinates {
  lat: number
  lng: number
}

/** Earth's mean radius, kilometres. */
const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (value === null || typeof value !== 'object') return false
  const { lat, lng } = value as Coordinates
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the equirectangular approximation: the cheap one is off
 * by a few percent, which is invisible at Israel's scale, but it also breaks
 * near the poles and at the antimeridian in ways that are hard to notice in a
 * test suite and easy to hit with a bad coordinate from a browser.
 */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)

  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Distance as a customer reads it.
 *
 * Under a kilometre is rounded to the nearest 100 m, because "0.4 ק״מ" is
 * useful and "0.437 ק״מ" is noise. Above 10 km the decimal is dropped for the
 * same reason.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 1) return `${Math.round(km * 10) / 10} ק"מ`
  if (km < 10) return `${km.toFixed(1)} ק"מ`
  return `${Math.round(km)} ק"מ`
}

/**
 * Where a supplier is, most precise source first.
 *
 * A real per-supplier coordinate beats the city centre. Both are absent for
 * every live supplier today, which is why the city fallback exists at all - see
 * the note at the top of cities.ts.
 */
export interface SupplierLocationInput {
  latitude?: number | null
  longitude?: number | null
  city?: string | null
}

export interface SupplierLocation {
  coordinates: Coordinates | null
  city: City | null
  /** Which source answered, so the UI can say "approximate" honestly. */
  precision: 'exact' | 'city' | 'unknown'
}

export function supplierLocation(supplier: SupplierLocationInput | null): SupplierLocation {
  const city = cityByName(supplier?.city)

  const exact = { lat: Number(supplier?.latitude), lng: Number(supplier?.longitude) }
  if (supplier?.latitude != null && supplier?.longitude != null && isValidCoordinates(exact)) {
    return { coordinates: exact, city, precision: 'exact' }
  }

  if (city) return { coordinates: { lat: city.lat, lng: city.lng }, city, precision: 'city' }

  return { coordinates: null, city: null, precision: 'unknown' }
}

export interface Locatable {
  supplier?: SupplierLocationInput | null
}

export type WithDistance<T> = T & {
  distanceKm: number | null
  cityName: string | null
  distancePrecision: SupplierLocation['precision']
}

/**
 * Annotates each item with its distance from `origin`.
 *
 * An item whose location is unknown gets `null`, never `Infinity` and never 0.
 * Zero would sort it to the top as the closest thing available, which is the
 * exact opposite of what "we don't know where this is" should do.
 */
export function withDistances<T extends Locatable>(
  items: readonly T[],
  origin: Coordinates | null,
): WithDistance<T>[] {
  return items.map((item) => {
    const location = supplierLocation(item.supplier ?? null)
    return {
      ...item,
      cityName: location.city?.name ?? null,
      distancePrecision: location.precision,
      distanceKm: origin && location.coordinates ? distanceKm(origin, location.coordinates) : null,
    }
  })
}

/**
 * Nearest first; everything with an unknown location keeps its original order
 * at the end.
 *
 * Stable on ties, which matters because every supplier in one city shares a
 * coordinate under the city fallback: without a stable sort, two deals in Tel
 * Aviv would swap places between renders for no reason a customer could see.
 */
export function sortByDistance<T extends Locatable>(
  items: readonly T[],
  origin: Coordinates | null,
): WithDistance<T>[] {
  const annotated = withDistances(items, origin)
  if (!origin) return annotated

  return annotated
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ad = a.item.distanceKm
      const bd = b.item.distanceKm
      if (ad === null && bd === null) return a.index - b.index
      if (ad === null) return 1
      if (bd === null) return -1
      return ad === bd ? a.index - b.index : ad - bd
    })
    .map(({ item }) => item)
}

/** Keeps only what sits in one city. Used by the city tags and the picker. */
export function filterByCity<T extends Locatable>(
  items: readonly T[],
  citySlug: string | null,
): T[] {
  if (!citySlug) return [...items]
  return items.filter((item) => supplierLocation(item.supplier ?? null).city?.slug === citySlug)
}

/**
 * The `?near=lat,lng` query the city tags write, parsed back into a point.
 *
 * Returns null for anything that is not two finite in-range numbers. This value
 * is user-controlled - it arrives in a URL anybody can edit - so it is
 * validated, never trusted, and a bad one degrades to "no origin" rather than
 * to a coordinate at (0, 0).
 */
export function parseNear(raw: string | string[] | undefined): Coordinates | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null

  const parts = value.split(',')
  if (parts.length !== 2) return null

  const point = { lat: Number(parts[0]), lng: Number(parts[1]) }
  return isValidCoordinates(point) ? point : null
}
