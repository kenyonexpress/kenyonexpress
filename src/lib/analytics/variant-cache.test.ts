/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  VARIANT_CACHE_KEY,
  featureFlagProperties,
  featureProperty,
  readVariantCache,
  writeVariantCache,
} from './variant-cache'

afterEach(() => {
  window.sessionStorage.clear()
})

describe('the shared variant map', () => {
  it('is null before any decision and {} after a decision that put the browser in nothing', () => {
    expect(readVariantCache()).toBeNull()
    writeVariantCache({})
    expect(readVariantCache()).toEqual({})
  })

  it('round-trips several flags in one entry', () => {
    writeVariantCache({ checkout_variant: 'express_summary', home_hero: 'static_hero' })
    expect(readVariantCache()).toEqual({
      checkout_variant: 'express_summary',
      home_hero: 'static_hero',
    })
    expect(window.sessionStorage.length).toBe(1)
  })

  it('reads a malformed or non-map entry as null, so the next page asks again', () => {
    for (const raw of ['express_summary', '[]', '{"a":1}', 'null', '{bad json']) {
      window.sessionStorage.setItem(VARIANT_CACHE_KEY, raw)
      expect(readVariantCache(), raw).toBeNull()
    }
  })

  it('keeps the key under the ke_ prefix the cookie policy scans for', () => {
    expect(VARIANT_CACHE_KEY).toMatch(/^ke_[a-z0-9_]+$/)
  })
})

describe('featureFlagProperties', () => {
  it('names each flag the way PostHog reads it natively', () => {
    expect(featureProperty('home_hero')).toBe('$feature/home_hero')
    expect(featureFlagProperties({ home_hero: 'static_hero', cta_copy: 'invite' })).toEqual({
      '$feature/home_hero': 'static_hero',
      '$feature/cta_copy': 'invite',
    })
  })

  it('is empty before a decision and after an empty one', () => {
    expect(featureFlagProperties(null)).toEqual({})
    expect(featureFlagProperties({})).toEqual({})
  })
})
