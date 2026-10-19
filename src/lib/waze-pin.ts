/**
 * The Waze link behind the location pin.
 *
 * Coordinates win: `ll=<lat>,<lng>&navigate=yes` lands on the exact spot. A
 * written address is the fallback and goes through `q=`. A city alone is NOT
 * enough to build a link: it would navigate to a city centre, which is not where
 * anything is redeemed, so the pin then renders as text only.
 */
export interface PinLocation {
  city?: string | null
  fullAddress?: string | null
  latitude?: number | null
  longitude?: number | null
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export function locationPinHref(loc: PinLocation): string | null {
  const { latitude, longitude } = loc
  if (
    finite(latitude) &&
    finite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`
  }
  const address = loc.fullAddress?.trim()
  if (address) return `https://waze.com/ul?q=${encodeURIComponent(address)}`
  return null
}
