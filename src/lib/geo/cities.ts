/**
 * Israeli cities, their coordinates, and the five that get a tag under the hero.
 *
 * WHY A TABLE AND NOT A GEOCODER
 *
 * `suppliers.city` is a text column that is filled in for 5 of the 11 live
 * suppliers; `suppliers.address` is filled in for NONE of them (measured
 * 2026-08-07). There is nothing to geocode. A per-supplier lat/lng exists as
 * columns in 136 and is the right long-term home for a real address,
 * but until somebody enters those addresses, the only location signal in the
 * database is the city name.
 *
 * So distance is computed from the city centre. That is honest at the
 * resolution the data actually has: it can tell Tel Aviv from Haifa, which is
 * what "deals near me" means to a customer, and it does not pretend to know
 * which street a business is on. When `suppliers.latitude` is filled in, the
 * per-supplier coordinate wins - see `supplierCoordinates`.
 *
 * The coordinates below are municipal centres, public geographic fact, rounded
 * to four decimals (about 11 m). They are not business data and nothing about
 * them is invented.
 */

export interface City {
  /** Stable key used in the URL, so a link survives a label change. */
  slug: string
  /** As it is written in `suppliers.city`, and as it is shown. */
  name: string
  lat: number
  lng: number
}

/**
 * The five under the hero, in this order, per the goal.
 *
 * Order is deliberate and not alphabetical: it is by population, which is also
 * roughly the order a customer scans for their own city.
 */
export const HERO_CITY_SLUGS = ['tel-aviv', 'jerusalem', 'haifa', 'beer-sheva', 'eilat'] as const

export const CITIES: readonly City[] = [
  { slug: 'tel-aviv', name: 'תל אביב', lat: 32.0853, lng: 34.7818 },
  { slug: 'jerusalem', name: 'ירושלים', lat: 31.7683, lng: 35.2137 },
  { slug: 'haifa', name: 'חיפה', lat: 32.794, lng: 34.9896 },
  { slug: 'beer-sheva', name: 'באר שבע', lat: 31.2518, lng: 34.7913 },
  { slug: 'eilat', name: 'אילת', lat: 29.5581, lng: 34.9482 },
  // Beyond the five. Present because suppliers already carry these names, and a
  // city the database knows about must not fall off the map just because it has
  // no tag under the hero.
  { slug: 'herzliya', name: 'הרצליה', lat: 32.1624, lng: 34.8442 },
  { slug: 'netanya', name: 'נתניה', lat: 32.3215, lng: 34.8532 },
  { slug: 'rishon-lezion', name: 'ראשון לציון', lat: 31.973, lng: 34.8066 },
  { slug: 'petah-tikva', name: 'פתח תקווה', lat: 32.0878, lng: 34.8878 },
  { slug: 'ashdod', name: 'אשדוד', lat: 31.8044, lng: 34.6553 },
  { slug: 'kfar-saba', name: 'כפר סבא', lat: 32.175, lng: 34.907 },
  { slug: 'ramat-gan', name: 'רמת גן', lat: 32.0684, lng: 34.8248 },
  { slug: 'tiberias', name: 'טבריה', lat: 32.7922, lng: 35.5312 },
]

const BY_SLUG = new Map(CITIES.map((c) => [c.slug, c]))

/**
 * Indexed by NORMALISED name, because `suppliers.city` is free text typed by a
 * person. "תל אביב", "תל-אביב" and "תל אביב " are the same city and must not
 * become three.
 */
function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/[\s\-־]+/g, ' ')
    .replace(/^עיר\s+/, '')
}

const BY_NAME = new Map(CITIES.map((c) => [normalizeName(c.name), c]))

export function cityBySlug(slug: string | null | undefined): City | null {
  if (!slug) return null
  return BY_SLUG.get(slug) ?? null
}

/**
 * The city a free-text value names, or null.
 *
 * Returns null rather than a nearest guess: showing a Haifa business under
 * "תל אביב" because the strings were close is worse than not placing it at all.
 */
export function cityByName(value: string | null | undefined): City | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const exact = BY_NAME.get(normalizeName(value))
  if (exact) return exact

  // "תל אביב יפו" and "תל אביב-יפו" both name Tel Aviv. Prefix match only, and
  // only in that direction, so "רמת גן" never resolves to "רמת".
  const normalized = normalizeName(value)
  for (const city of CITIES) {
    const name = normalizeName(city.name)
    if (normalized.startsWith(`${name} `)) return city
  }
  return null
}

export const HERO_CITIES: readonly City[] = HERO_CITY_SLUGS.map((slug) => {
  const city = BY_SLUG.get(slug)
  // A typo in HERO_CITY_SLUGS would otherwise render an empty tag row with no
  // indication of why. Failing at module load is louder and cheaper.
  if (!city) throw new Error(`HERO_CITY_SLUGS names an unknown city: ${slug}`)
  return city
})
