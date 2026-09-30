import { CITIES } from '@/lib/geo/cities'
import { DELIVERY_BANDS, deliveryLabel, estimateDelivery } from '@/lib/shipping/estimate'
import { SHIPPING_METHODS } from '@/lib/shipping/methods'
import { describe, expect, it } from 'vitest'

describe('estimateDelivery', () => {
  it('places the hub and its neighbours in the metro band', () => {
    expect(estimateDelivery('tel-aviv', 'supplier_delivery')).toMatchObject({
      band: 'metro',
      minDays: 3,
      maxDays: 4,
      label: '3-4 ימי עסקים',
    })
    expect(estimateDelivery('ramat-gan', 'supplier_delivery')?.band).toBe('metro')
    expect(estimateDelivery('herzliya', 'supplier_delivery')?.band).toBe('metro')
  })

  it('places Jerusalem, Haifa and Beer Sheva in the regional band', () => {
    for (const slug of ['jerusalem', 'haifa', 'beer-sheva']) {
      expect(estimateDelivery(slug, 'supplier_delivery')?.band, slug).toBe('regional')
    }
  })

  it('places Eilat in the remote band', () => {
    expect(estimateDelivery('eilat', 'supplier_delivery')).toMatchObject({
      band: 'remote',
      label: '5-7 ימי עסקים',
    })
  })

  it('is null for pickup: nothing travels', () => {
    expect(estimateDelivery('tel-aviv', 'pickup')).toBeNull()
  })

  it('is null for a city it cannot place, never a default band', () => {
    expect(estimateDelivery('atlantis', 'supplier_delivery')).toBeNull()
    expect(estimateDelivery(null, 'supplier_delivery')).toBeNull()
    expect(estimateDelivery(undefined, 'supplier_delivery')).toBeNull()
  })

  it('estimates every known city and every band stays inside the method promise', () => {
    // The registry text says 3-7 business days; no city may be promised more
    // or less than that.
    const method = SHIPPING_METHODS.find((entry) => entry.id === 'supplier_delivery')
    expect(method?.description).toContain('3-7')
    for (const city of CITIES) {
      const estimate = estimateDelivery(city.slug, 'supplier_delivery')
      expect(estimate, city.slug).not.toBeNull()
      expect(estimate?.minDays).toBeGreaterThanOrEqual(3)
      expect(estimate?.maxDays).toBeLessThanOrEqual(7)
      expect(estimate?.minDays).toBeLessThanOrEqual(estimate?.maxDays ?? 0)
    }
  })

  it('bands are ordered by distance with the last one unbounded', () => {
    const edges = DELIVERY_BANDS.map((band) => band.maxKm)
    expect(edges).toEqual([...edges].sort((a, b) => a - b))
    expect(edges.at(-1)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('deliveryLabel', () => {
  it('collapses an equal range to one number', () => {
    expect(deliveryLabel(3, 3)).toBe('3 ימי עסקים')
    expect(deliveryLabel(3, 5)).toBe('3-5 ימי עסקים')
  })
})
