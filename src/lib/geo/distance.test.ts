import { describe, expect, it } from 'vitest'
import { CITIES, HERO_CITIES, cityByName, cityBySlug } from './cities'
import {
  distanceKm,
  filterByCity,
  formatDistance,
  isValidCoordinates,
  parseNear,
  productLocation,
  sortByDistance,
  supplierLocation,
} from './distance'

const TEL_AVIV = { lat: 32.0853, lng: 34.7818 }
const HAIFA = { lat: 32.794, lng: 34.9896 }
const EILAT = { lat: 29.5581, lng: 34.9482 }

function deal(id: string, city: string | null, extra: Record<string, unknown> = {}) {
  return { id, supplier: { city, ...extra } }
}

describe('the city table', () => {
  it('puts the five hero cities in the order the goal asked for', () => {
    expect(HERO_CITIES.map((c) => c.name)).toEqual([
      'תל אביב',
      'ירושלים',
      'חיפה',
      'באר שבע',
      'אילת',
    ])
  })

  it('has unique slugs and plausible Israeli coordinates', () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length)
    for (const city of CITIES) {
      expect(city.lat).toBeGreaterThan(29)
      expect(city.lat).toBeLessThan(34)
      expect(city.lng).toBeGreaterThan(34)
      expect(city.lng).toBeLessThan(36)
    }
  })

  it('resolves a free-text city the way a person actually types it', () => {
    // suppliers.city is typed by hand. These are the same city.
    expect(cityByName('תל אביב')?.slug).toBe('tel-aviv')
    expect(cityByName('תל-אביב')?.slug).toBe('tel-aviv')
    expect(cityByName('  תל אביב  ')?.slug).toBe('tel-aviv')
    expect(cityByName('תל אביב יפו')?.slug).toBe('tel-aviv')
  })

  it('returns null rather than guessing a nearby name', () => {
    // Placing a Haifa business under Tel Aviv because the strings were close is
    // worse than not placing it at all.
    expect(cityByName('רמת')).toBeNull()
    expect(cityByName('לונדון')).toBeNull()
    expect(cityByName('')).toBeNull()
    expect(cityByName(null)).toBeNull()
    expect(cityBySlug('atlantis')).toBeNull()
  })
})

describe('distanceKm', () => {
  it('matches known real-world distances', () => {
    // Tel Aviv to Haifa is about 82 km great-circle.
    expect(distanceKm(TEL_AVIV, HAIFA)).toBeGreaterThan(78)
    expect(distanceKm(TEL_AVIV, HAIFA)).toBeLessThan(86)
    // Tel Aviv to Eilat is about 285 km.
    expect(distanceKm(TEL_AVIV, EILAT)).toBeGreaterThan(275)
    expect(distanceKm(TEL_AVIV, EILAT)).toBeLessThan(295)
  })

  it('is zero to itself and symmetric', () => {
    expect(distanceKm(TEL_AVIV, TEL_AVIV)).toBe(0)
    expect(distanceKm(TEL_AVIV, HAIFA)).toBeCloseTo(distanceKm(HAIFA, TEL_AVIV), 9)
  })

  it('survives the antimeridian and the poles', () => {
    expect(distanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeLessThan(30)
    expect(Number.isFinite(distanceKm({ lat: 90, lng: 0 }, { lat: -90, lng: 0 }))).toBe(true)
  })

  it('rejects coordinates that are not coordinates', () => {
    expect(isValidCoordinates({ lat: 91, lng: 0 })).toBe(false)
    expect(isValidCoordinates({ lat: 0, lng: 181 })).toBe(false)
    expect(isValidCoordinates({ lat: Number.NaN, lng: 0 })).toBe(false)
    expect(isValidCoordinates({ lat: '32', lng: '34' })).toBe(false)
    expect(isValidCoordinates(null)).toBe(false)
  })
})

describe('formatDistance', () => {
  it('drops precision nobody can use', () => {
    expect(formatDistance(0.437)).toBe('0.4 ק"מ')
    expect(formatDistance(3.1489)).toBe('3.1 ק"מ')
    expect(formatDistance(82.4)).toBe('82 ק"מ')
  })

  it('says nothing rather than something wrong', () => {
    expect(formatDistance(Number.NaN)).toBe('')
    expect(formatDistance(-5)).toBe('')
  })
})

describe('supplierLocation', () => {
  it('prefers a real coordinate over the city centre', () => {
    const location = supplierLocation({ latitude: 32.11, longitude: 34.8, city: 'תל אביב' })
    expect(location.precision).toBe('exact')
    expect(location.coordinates).toEqual({ lat: 32.11, lng: 34.8 })
    expect(location.city?.slug).toBe('tel-aviv')
  })

  it('falls back to the city centre, and says so', () => {
    const location = supplierLocation({ city: 'חיפה' })
    expect(location.precision).toBe('city')
    expect(location.coordinates).toEqual({ lat: 32.794, lng: 34.9896 })
  })

  it('is unknown when there is nothing to go on', () => {
    // This is every live supplier today: city null, address null.
    expect(supplierLocation({ city: null }).precision).toBe('unknown')
    expect(supplierLocation(null).coordinates).toBeNull()
  })

  it('ignores a half-filled coordinate instead of reading it as zero', () => {
    // lat 32 with lng null must not become {32, 0}, which is in the Atlantic.
    expect(supplierLocation({ latitude: 32.1, longitude: null, city: 'חיפה' }).precision).toBe(
      'city',
    )
  })
})

describe('sortByDistance', () => {
  const deals = [
    deal('eilat', 'אילת'),
    deal('haifa', 'חיפה'),
    deal('nowhere', null),
    deal('telaviv', 'תל אביב'),
  ]

  it('puts the nearest first', () => {
    expect(sortByDistance(deals, TEL_AVIV).map((d) => d.id)).toEqual([
      'telaviv',
      'haifa',
      'eilat',
      'nowhere',
    ])
  })

  it('sinks unknown locations rather than treating them as here', () => {
    // distanceKm null, never 0: zero would make an unplaceable deal the
    // closest thing on the page.
    const sorted = sortByDistance(deals, TEL_AVIV)
    expect(sorted.at(-1)?.id).toBe('nowhere')
    expect(sorted.at(-1)?.distanceKm).toBeNull()
  })

  it('leaves the order alone when there is no origin', () => {
    expect(sortByDistance(deals, null).map((d) => d.id)).toEqual([
      'eilat',
      'haifa',
      'nowhere',
      'telaviv',
    ])
  })

  it('is stable for deals that share a city', () => {
    // Every supplier in one city shares a coordinate under the city fallback.
    // Without a stable sort these would swap between renders.
    const sameCity = [deal('a', 'תל אביב'), deal('b', 'תל אביב'), deal('c', 'תל אביב')]
    expect(sortByDistance(sameCity, HAIFA).map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })

  it('annotates the city name for the card to show', () => {
    const sorted = sortByDistance(deals, TEL_AVIV)
    expect(sorted[0]?.cityName).toBe('תל אביב')
    expect(sorted.at(-1)?.cityName).toBeNull()
  })
})

describe('filterByCity', () => {
  const deals = [deal('a', 'תל אביב'), deal('b', 'חיפה'), deal('c', null)]

  it('keeps only that city', () => {
    expect(filterByCity(deals, 'tel-aviv').map((d) => d.id)).toEqual(['a'])
  })

  it('keeps everything when no city is chosen', () => {
    expect(filterByCity(deals, null)).toHaveLength(3)
  })

  it('never smuggles an unplaceable deal into a city', () => {
    expect(filterByCity(deals, 'haifa').map((d) => d.id)).toEqual(['b'])
  })
})

describe('parseNear', () => {
  it('reads the coordinate the city tags write', () => {
    expect(parseNear('32.0853,34.7818')).toEqual({ lat: 32.0853, lng: 34.7818 })
    expect(parseNear(['32.0853,34.7818'])).toEqual({ lat: 32.0853, lng: 34.7818 })
  })

  it('refuses anything a hand-edited URL might contain', () => {
    // Degrading to null means "no origin". Degrading to {0,0} would sort the
    // whole page by distance from the Gulf of Guinea.
    expect(parseNear('0,0')).toEqual({ lat: 0, lng: 0 })
    expect(parseNear('91,0')).toBeNull()
    expect(parseNear('32')).toBeNull()
    expect(parseNear('32,34,36')).toBeNull()
    expect(parseNear('abc,def')).toBeNull()
    expect(parseNear('')).toBeNull()
    expect(parseNear(undefined)).toBeNull()
  })
})

describe('productLocation', () => {
  const telAviv = { lat: 32.0853, lng: 34.7818 }

  it('falls back to the supplier when the product says nothing', () => {
    // The behaviour every one of the 80 existing rows keeps: the columns from
    // 002-products-geo are unapplied, so `city` is undefined on every item.
    const location = productLocation({ supplier: { city: 'תל אביב' } })
    expect(location.city?.slug).toBe('tel-aviv')
    expect(location.precision).toBe('city')
  })

  it('lets the product override the supplier city', () => {
    // A spa weekend sold in Eilat by a Tel Aviv business.
    const location = productLocation({ city: 'אילת', supplier: { city: 'תל אביב' } })
    expect(location.city?.slug).toBe('eilat')
  })

  it('does not let an inherited coordinate drag the deal back to the supplier', () => {
    // The trap this exists for: the supplier has an exact coordinate and the
    // product only names a different city. Taking the coordinate because it is
    // "more precise" puts the Eilat deal in Tel Aviv. Specificity beats
    // precision when they disagree.
    const location = productLocation({
      city: 'אילת',
      supplier: { city: 'תל אביב', latitude: telAviv.lat, longitude: telAviv.lng },
    })
    expect(location.city?.slug).toBe('eilat')
    expect(location.precision).toBe('city')
    expect(location.coordinates?.lat).not.toBeCloseTo(telAviv.lat, 3)
  })

  it('prefers the product own coordinate over everything', () => {
    const location = productLocation({
      city: 'אילת',
      latitude: 29.5581,
      longitude: 34.9482,
      supplier: { city: 'תל אביב', latitude: telAviv.lat, longitude: telAviv.lng },
    })
    expect(location.precision).toBe('exact')
    expect(location.coordinates?.lat).toBeCloseTo(29.5581, 4)
  })

  it('never builds a point from two different sources', () => {
    // Half a product coordinate is not partial data, it is a point in the
    // Atlantic. The pair comes from one source or the supplier answers.
    const location = productLocation({
      latitude: 29.5581,
      supplier: { city: 'תל אביב', latitude: telAviv.lat, longitude: telAviv.lng },
    })
    expect(location.coordinates?.lat).toBeCloseTo(telAviv.lat, 4)
    expect(location.coordinates?.lng).toBeCloseTo(telAviv.lng, 4)
  })

  it('reports unknown when neither side knows', () => {
    expect(productLocation({ supplier: null }).precision).toBe('unknown')
    expect(productLocation(null).precision).toBe('unknown')
  })

  it('filters and sorts on the overridden city', () => {
    const items = [
      { id: 'a', city: 'אילת', supplier: { city: 'תל אביב' } },
      { id: 'b', supplier: { city: 'תל אביב' } },
    ]
    expect(filterByCity(items, 'eilat').map((i) => i.id)).toEqual(['a'])
    expect(filterByCity(items, 'tel-aviv').map((i) => i.id)).toEqual(['b'])

    // Nearest-first from Eilat puts the overridden deal ahead of its supplier.
    expect(sortByDistance(items, { lat: 29.5581, lng: 34.9482 }).map((i) => i.id)).toEqual([
      'a',
      'b',
    ])
  })
})
