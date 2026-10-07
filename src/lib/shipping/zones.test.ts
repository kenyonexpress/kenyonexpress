import { cityBySlug } from '@/lib/geo/cities'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  ZONE_SEED,
  policiesFromRows,
  policyFor,
  shopperShippingAgorot,
  zoneForCity,
  zoneForCityName,
} from './zones'

describe('zoneForCity', () => {
  it('places the hub and its neighbours in the centre', () => {
    expect(zoneForCity(cityBySlug('tel-aviv'))).toBe('center')
    expect(zoneForCity(cityBySlug('rishon-lezion'))).toBe('center')
  })

  it('names Eilat rather than measuring it', () => {
    expect(zoneForCity(cityBySlug('eilat'))).toBe('eilat')
  })

  it('splits north and south by latitude outside the centre', () => {
    expect(zoneForCity(cityBySlug('haifa'))).toBe('north')
    expect(zoneForCity(cityBySlug('beer-sheva'))).toBe('south')
  })

  it('returns null for an unknown city instead of guessing', () => {
    expect(zoneForCity(null)).toBeNull()
    expect(zoneForCityName('עיר שלא קיימת')).toBeNull()
    expect(zoneForCityName('חיפה')).toBe('north')
  })
})

describe('zone policy', () => {
  it('the seed is 197 exactly: five zones, free everywhere', () => {
    expect(ZONE_SEED.map((z) => z.id)).toEqual(['center', 'north', 'south', 'eilat', 'remote'])
    for (const z of ZONE_SEED) {
      expect(z.flatAgorot).toBe(0)
      expect(z.freeAboveAgorot).toBe(0)
      expect(z.deliverable).toBe(true)
    }
  })

  it('charges the flat rate below the threshold and nothing at or above it', () => {
    const policy = { ...ZONE_SEED[0]!, flatAgorot: agorot(2900), freeAboveAgorot: agorot(19_900) }
    expect(shopperShippingAgorot(policy, agorot(10_000))).toBe(2900)
    expect(shopperShippingAgorot(policy, agorot(19_900))).toBe(0)
    expect(shopperShippingAgorot({ ...policy, freeAboveAgorot: null }, agorot(1_000_000))).toBe(
      2900,
    )
  })

  it('reads PostgREST rows with bigint as string and drops junk', () => {
    const policies = policiesFromRows([
      {
        id: 'eilat',
        name_he: 'אילת',
        flat_agorot: '3500',
        free_above_agorot: null,
        deliverable: true,
      },
      { id: 'mars', name_he: 'מאדים', flat_agorot: 0, free_above_agorot: 0, deliverable: true },
      { id: 'north', name_he: 'צפון', flat_agorot: -1, free_above_agorot: 0, deliverable: true },
    ])
    expect(policies).toHaveLength(1)
    expect(policies[0]).toMatchObject({ id: 'eilat', flatAgorot: 3500, freeAboveAgorot: null })
    expect(policyFor('north', policies).flatAgorot).toBe(0)
    expect(policyFor('eilat', policies).flatAgorot).toBe(3500)
  })
})
