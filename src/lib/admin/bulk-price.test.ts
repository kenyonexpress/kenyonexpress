import { describe, expect, it } from 'vitest'
import { catalogueIlsToAgorot, scaleCatalogueIls } from './bulk-price'

describe('catalogueIlsToAgorot', () => {
  it('converts the float-trap price 33.35 exactly', () => {
    // 33.35 * 100 is 3334.9999... in binary floats; the string path must not
    // inherit that.
    expect(catalogueIlsToAgorot(33.35)).toBe(3335)
  })

  it('accepts numeric strings as the DB numeric type may deliver them', () => {
    expect(catalogueIlsToAgorot('25.5')).toBe(2550)
    expect(catalogueIlsToAgorot('19')).toBe(1900)
  })

  it('maps null to 0 agorot (missing catalogue price)', () => {
    expect(catalogueIlsToAgorot(null)).toBe(0)
  })

  it('rejects non-numeric and non-finite input', () => {
    expect(catalogueIlsToAgorot('abc')).toBeNull()
    expect(catalogueIlsToAgorot(undefined)).toBeNull()
    expect(catalogueIlsToAgorot(Number.POSITIVE_INFINITY)).toBeNull()
    expect(catalogueIlsToAgorot(Number.NaN)).toBeNull()
  })
})

describe('scaleCatalogueIls', () => {
  it('scales -10% on 33.35 in integer agorot (half-up), not floats', () => {
    // 3335 * 9000bp = 3001.5 agorot -> half-up 3002 -> 30.02 ILS.
    // The old float body (round2(33.35 * 0.9)) returned 30.01.
    expect(scaleCatalogueIls(33.35, -10)).toBe(30.02)
  })

  it('scales +25% exactly', () => {
    expect(scaleCatalogueIls(100, 25)).toBe(125)
  })

  it('is the identity at 0%', () => {
    expect(scaleCatalogueIls(19.99, 0)).toBe(19.99)
  })

  it('rounds half-up at the single-agora boundary', () => {
    // 1 agora at -50%: 0.5 agorot -> half-up 1 agora.
    expect(scaleCatalogueIls(0.01, -50)).toBe(0.01)
  })

  it('supports factors above 100% that bp() itself would reject', () => {
    expect(scaleCatalogueIls(10, 400)).toBe(50)
  })

  it('returns null below -100% and for unusable prices', () => {
    expect(scaleCatalogueIls(10, -150)).toBeNull()
    expect(scaleCatalogueIls('abc', 10)).toBeNull()
  })
})
