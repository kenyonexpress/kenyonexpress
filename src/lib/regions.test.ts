import { cityBySlug } from '@/lib/geo/cities'
import { REGIONS, findRegion, regionHref } from '@/lib/regions'
import { describe, expect, it } from 'vitest'

/**
 * THE REGION LIST IS A COPY OF SOMEBODY ELSE'S URLS, WHICH IS WHY IT IS TESTED.
 *
 * These seventeen slugs are live's, decoded from the percent-encoded Hebrew in
 * `/city/%d7%aa%d7%9c-%d7%90%d7%91%d7%99%d7%91/` and friends. They are not ours
 * to prettify: each one is a page with inbound links and search rankings, and a
 * "tidier" ASCII slug would silently drop all of it. The assertions below are
 * the things that would break that quietly.
 */

describe('the region list', () => {
  it('has exactly the seventeen regions live offers', () => {
    expect(REGIONS).toHaveLength(17)
  })

  it('uses unique slugs', () => {
    const slugs = REGIONS.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('keeps live spellings that look like typos but are not', () => {
    // Live writes it without the second vav. That is live's URL, so it is ours.
    expect(REGIONS.some((r) => r.slug === 'פתח-תקוה')).toBe(true)
    expect(REGIONS.some((r) => r.slug === 'פתח-תקווה')).toBe(false)
  })

  it('keeps the EN DASH in the four compound region names', () => {
    // U+2013, not a hyphen. The names are display strings and live renders an
    // en dash; a hyphen here is a different string in every comparison.
    const compound = REGIONS.filter((r) => r.name.includes('–'))
    expect(compound.map((r) => r.name)).toEqual([
      'רמת גן – גבעתיים – בני ברק',
      'חולון – בת ים – ראשון לציון',
      'רחובות – נס ציונה',
      'אשדוד – אשקלון',
    ])
  })

  it('stores slugs decoded, never percent-encoded', () => {
    for (const region of REGIONS) {
      expect(region.slug).not.toContain('%')
    }
  })

  it('encodes exactly once at the link boundary', () => {
    const telAviv = findRegion('תל-אביב')
    expect(telAviv).toBeDefined()
    // The href live serves, minus its trailing slash.
    expect(regionHref(telAviv as (typeof REGIONS)[number])).toBe(
      '/city/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91',
    )
  })

  it('round-trips every slug through encode/decode', () => {
    for (const region of REGIONS) {
      expect(decodeURIComponent(encodeURIComponent(region.slug))).toBe(region.slug)
    }
  })

  it('finds nothing for an unknown slug', () => {
    expect(findRegion('no-such-region')).toBeUndefined()
    expect(findRegion('')).toBeUndefined()
  })

  /**
   * The seam between regions and municipalities. A region may legitimately map
   * to no city -- six do -- but it must never name a city that does not exist,
   * which is the failure that would render a region page with a blank chip.
   */
  it('names only cities that geo/cities.ts actually defines', () => {
    for (const region of REGIONS) {
      for (const slug of region.cities) {
        expect(cityBySlug(slug), `region ${region.slug} names unknown city ${slug}`).not.toBeNull()
      }
    }
  })

  it('maps twelve regions to at least one city and leaves five empty', () => {
    // Asserted as a count rather than a list so that filling one in is a
    // deliberate one-number diff here, not a silent change in coverage.
    const withCities = REGIONS.filter((r) => r.cities.length > 0)
    expect(withCities).toHaveLength(12)
    expect(REGIONS.length - withCities.length).toBe(5)
    expect(REGIONS.filter((r) => r.cities.length === 0).map((r) => r.slug)).toEqual([
      'חדרה-והסביבה',
      'השפלה',
      'רחובות-נס-ציונה',
      'גליל-עליון',
      'גולן',
    ])
  })
})
