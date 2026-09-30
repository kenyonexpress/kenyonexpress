import { describe, expect, it } from 'vitest'
import { productLocation, supplierLocation } from './distance'
import { MERCHANT_MAP_ORIGIN, buildMerchantMap } from './merchant-map'

describe('buildMerchantMap', () => {
  it('returns null when nothing locates the business', () => {
    expect(buildMerchantMap(supplierLocation(null))).toBeNull()
    expect(buildMerchantMap(supplierLocation({ city: 'עיר שאינה ברשימה' }))).toBeNull()
  })

  it('centres on a real coordinate with a tight box and says it is exact', () => {
    const map = buildMerchantMap(
      supplierLocation({ latitude: 32.0853, longitude: 34.7818, city: 'תל אביב' }),
    )
    expect(map).not.toBeNull()
    const src = new URL(map!.embedSrc)
    expect(src.origin).toBe(MERCHANT_MAP_ORIGIN)
    expect(src.pathname).toBe('/export/embed.html')
    expect(src.searchParams.get('marker')).toBe('32.08530,34.78180')
    expect(src.searchParams.get('bbox')).toBe('34.77180,32.07530,34.79180,32.09530')
    expect(map!.precision).toBe('exact')
    expect(map!.precisionLabel).toBe('מיקום מדויק')
  })

  it('falls back to the city centre with a wide box and says so', () => {
    const map = buildMerchantMap(supplierLocation({ city: 'תל אביב' }))
    expect(map).not.toBeNull()
    expect(map!.precision).toBe('city')
    expect(map!.precisionLabel).toBe('מיקום משוער לפי עיר')
    const [w, s, e, n] = new URL(map!.embedSrc).searchParams
      .get('bbox')!
      .split(',')
      .map(Number) as [number, number, number, number]
    expect(e - w).toBeCloseTo(0.12, 5)
    expect(n - s).toBeCloseTo(0.12, 5)
  })

  it('links Google Maps and OpenStreetMap to the same point', () => {
    const map = buildMerchantMap(productLocation({ supplier: { city: 'חיפה' } }))!
    const google = new URL(map.googleMapsHref)
    expect(google.hostname).toBe('www.google.com')
    expect(google.searchParams.get('query')).toMatch(/^\d+\.\d{5},\d+\.\d{5}$/)
    const osm = new URL(map.osmHref)
    expect(osm.origin).toBe(MERCHANT_MAP_ORIGIN)
    expect(osm.hash).toMatch(/^#map=12\//)
    expect(`${osm.searchParams.get('mlat')},${osm.searchParams.get('mlon')}`).toBe(
      google.searchParams.get('query'),
    )
  })

  it('never emits a host the frame policy does not allow', () => {
    const map = buildMerchantMap(supplierLocation({ city: 'ירושלים' }))!
    expect(map.embedSrc.startsWith(`${MERCHANT_MAP_ORIGIN}/`)).toBe(true)
  })
})
