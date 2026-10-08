import { describe, expect, it } from 'vitest'
import type { LandingVariant } from './blocks'
import {
  CONTROL_VARIANT,
  LANDING_BUCKET_SPACE,
  chooseVariant,
  controlVariantKey,
  landingProperty,
  parseBucket,
  randomBucket,
  variantKeys,
} from './variant'

const AB: LandingVariant[] = [
  { key: 'control', weight: 50 },
  { key: 'b', weight: 50 },
]

describe('parseBucket', () => {
  it('accepts an integer inside the space and nothing else', () => {
    expect(parseBucket('0')).toBe(0)
    expect(parseBucket('9999')).toBe(9999)
    expect(parseBucket('10000')).toBeNull()
    expect(parseBucket('-1')).toBeNull()
    expect(parseBucket('12.5')).toBeNull()
    expect(parseBucket('abc')).toBeNull()
    expect(parseBucket('')).toBeNull()
    expect(parseBucket(undefined)).toBeNull()
  })
})

describe('randomBucket', () => {
  it('stays inside the space at both ends of the random range', () => {
    expect(randomBucket(() => 0)).toBe(0)
    expect(randomBucket(() => 0.999999999)).toBe(LANDING_BUCKET_SPACE - 1)
    expect(randomBucket(() => 1)).toBe(LANDING_BUCKET_SPACE - 1)
  })
})

describe('chooseVariant', () => {
  it('is control for a page with no variants, whatever the bucket', () => {
    expect(chooseVariant([], 0)).toBe(CONTROL_VARIANT)
    expect(chooseVariant([], 9999, 'b')).toBe(CONTROL_VARIANT)
  })

  it('is the first variant when there is no bucket (no consent, no cookie)', () => {
    expect(chooseVariant(AB, null)).toBe('control')
    expect(chooseVariant([{ key: 'x', weight: 1 }], null)).toBe('x')
  })

  it('splits the bucket space by normalised weight, cumulatively in order', () => {
    expect(chooseVariant(AB, 0)).toBe('control')
    expect(chooseVariant(AB, 4999)).toBe('control')
    expect(chooseVariant(AB, 5000)).toBe('b')
    expect(chooseVariant(AB, 9999)).toBe('b')

    const uneven: LandingVariant[] = [
      { key: 'control', weight: 1 },
      { key: 'b', weight: 1 },
      { key: 'c', weight: 2 },
    ]
    expect(chooseVariant(uneven, 2499)).toBe('control')
    expect(chooseVariant(uneven, 2500)).toBe('b')
    expect(chooseVariant(uneven, 4999)).toBe('b')
    expect(chooseVariant(uneven, 5000)).toBe('c')
  })

  it('sends everyone to the weighted arm when the other is zero', () => {
    const off: LandingVariant[] = [
      { key: 'control', weight: 100 },
      { key: 'b', weight: 0 },
    ]
    expect(chooseVariant(off, 9999)).toBe('control')
    const flipped: LandingVariant[] = [
      { key: 'control', weight: 0 },
      { key: 'b', weight: 100 },
    ]
    expect(chooseVariant(flipped, 0)).toBe('b')
  })

  it('falls back to control when every weight is zero', () => {
    expect(
      chooseVariant(
        [
          { key: 'control', weight: 0 },
          { key: 'b', weight: 0 },
        ],
        5000,
      ),
    ).toBe('control')
  })

  it('honours a ?v= override only for a key that exists', () => {
    expect(chooseVariant(AB, 0, 'b')).toBe('b')
    expect(chooseVariant(AB, 9999, 'control')).toBe('control')
    expect(chooseVariant(AB, 9999, 'nope')).toBe('b')
    expect(chooseVariant(AB, 0, '')).toBe('control')
  })

  it('is the same arm for the same bucket every time', () => {
    for (let bucket = 0; bucket < LANDING_BUCKET_SPACE; bucket += 97) {
      expect(chooseVariant(AB, bucket)).toBe(chooseVariant(AB, bucket))
    }
  })
})

describe('keys and property', () => {
  it('names control as the first variant', () => {
    expect(controlVariantKey(AB)).toBe('control')
    expect(controlVariantKey([{ key: 'z', weight: 1 }, ...AB])).toBe('z')
    expect(controlVariantKey([])).toBe(CONTROL_VARIANT)
    expect(variantKeys([])).toEqual([CONTROL_VARIANT])
    expect(variantKeys(AB)).toEqual(['control', 'b'])
  })

  it('reports under the $feature/<flag> shape PostHog reads natively', () => {
    expect(landingProperty('summer-2026')).toBe('$feature/lp_summer_2026')
  })
})
