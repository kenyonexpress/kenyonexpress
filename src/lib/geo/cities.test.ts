import { describe, expect, it } from 'vitest'
import { CITIES, HERO_CITIES, HERO_CITY_SLUGS, cityByName, cityBySlug } from './cities'

/**
 * The city table, which is the only location signal this database has.
 *
 * `suppliers.address` is filled in for none of the live suppliers and
 * `suppliers.city` is free text typed by a person, so every "deals near me"
 * result and every city tag resolves through `cityByName` on a string somebody
 * typed by hand. Two things can go wrong here and neither raises an error:
 * a coordinate entered the wrong way round, which silently relocates a
 * business, and a name that does not resolve, which silently drops one off
 * the map.
 */

/**
 * Israel's bounding box, generously drawn. A latitude and longitude swapped —
 * the single most common way a coordinate table goes wrong — puts every value
 * outside it, because Israel's longitudes (34-36) are not valid latitudes here
 * and its latitudes (29-33) are not valid longitudes.
 */
const BOUNDS = { minLat: 29.4, maxLat: 33.4, minLng: 34.2, maxLng: 35.9 }

describe('the city table', () => {
  it('has no duplicate slug', () => {
    // The slug map is built with `new Map`, which keeps the last of a duplicate
    // pair and drops the first without a word.
    const slugs = CITIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has no duplicate name', () => {
    const names = CITIES.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(CITIES.map((c) => [c.name, c] as const))('%s sits inside Israel', (_name, city) => {
    expect(city.lat).toBeGreaterThanOrEqual(BOUNDS.minLat)
    expect(city.lat).toBeLessThanOrEqual(BOUNDS.maxLat)
    expect(city.lng).toBeGreaterThanOrEqual(BOUNDS.minLng)
    expect(city.lng).toBeLessThanOrEqual(BOUNDS.maxLng)
  })

  it.each(CITIES.map((c) => [c.slug, c] as const))('%s round-trips through both lookups', (_slug, city) => {
    expect(cityBySlug(city.slug)).toBe(city)
    expect(cityByName(city.name)).toBe(city)
  })

  it('uses url-safe slugs, so a link survives being pasted', () => {
    for (const city of CITIES) {
      expect(city.slug, city.name).toMatch(/^[a-z][a-z-]*[a-z]$/)
    }
  })
})

describe('the five under the hero', () => {
  it('all resolve, and the module refuses to load if one does not', () => {
    // HERO_CITIES throws at module load on an unknown slug. Reaching this line
    // at all is the assertion; the expectation below is what it proves.
    expect(HERO_CITIES).toHaveLength(HERO_CITY_SLUGS.length)
  })

  it('keeps the declared order, which is by population and not alphabetical', () => {
    expect(HERO_CITIES.map((c) => c.slug)).toEqual([...HERO_CITY_SLUGS])
  })
})

describe('resolving a city from free text, which is what suppliers.city is', () => {
  it('accepts the name as written', () => {
    expect(cityByName('תל אביב')?.slug).toBe('tel-aviv')
  })

  it('accepts a hyphen or a maqaf where the space is', () => {
    // "תל-אביב" and "תל־אביב" are the same place. Three spellings must not
    // become three cities, which is what the name index is normalised for.
    expect(cityByName('תל-אביב')?.slug).toBe('tel-aviv')
    expect(cityByName('תל־אביב')?.slug).toBe('tel-aviv')
  })

  it('accepts stray whitespace at either end and in the middle', () => {
    expect(cityByName('  תל   אביב  ')?.slug).toBe('tel-aviv')
  })

  it('accepts the fuller municipal name', () => {
    expect(cityByName('תל אביב יפו')?.slug).toBe('tel-aviv')
    expect(cityByName('תל אביב-יפו')?.slug).toBe('tel-aviv')
  })

  it('accepts a leading "עיר"', () => {
    expect(cityByName('עיר חיפה')?.slug).toBe('haifa')
  })

  it('returns null for a city the table does not know', () => {
    // A nearest guess is worse than nothing: showing a Haifa business under
    // "תל אביב" because the strings were close misplaces a real address.
    expect(cityByName('כפר קאסם')).toBeNull()
  })

  it('does not resolve a prefix in the wrong direction', () => {
    // "רמת" must not become "רמת גן". The prefix rule exists to absorb a
    // SUFFIX the table does not carry, never to complete a name.
    expect(cityByName('רמת')).toBeNull()
    expect(cityByName('באר')).toBeNull()
  })

  it('does not match a name merely because it starts with the same letters', () => {
    // Without the trailing space in the prefix rule, "חיפהXY" would resolve.
    expect(cityByName('חיפהניקו')).toBeNull()
  })

  it.each([null, undefined, '', '   '])('returns null for %p rather than throwing', (value) => {
    expect(cityByName(value as string | null | undefined)).toBeNull()
  })
})

describe('resolving a city from a slug, which is what the URL carries', () => {
  it('finds a known slug', () => {
    expect(cityBySlug('beer-sheva')?.name).toBe('באר שבע')
  })

  it.each([null, undefined, '', 'atlantis'])('returns null for %p', (value) => {
    expect(cityBySlug(value as string | null | undefined)).toBeNull()
  })

  it('does not accept the display name in place of the slug', () => {
    // The two lookups are separate on purpose: the slug is the stable key and
    // survives a label change, so accepting one for the other would hide a
    // caller that has them mixed up.
    expect(cityBySlug('תל אביב')).toBeNull()
  })
})
