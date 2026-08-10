import { describe, expect, it } from 'vitest'
import {
  hasAnyThirdParty,
  isGa4MeasurementId,
  isMetaPixelId,
  readThirdPartyConfig,
  validatedConfig,
} from './third-party'

describe('readThirdPartyConfig', () => {
  it('treats blank and whitespace as unset', () => {
    // Vercel stores an empty variable as an empty string, not as absent, so a
    // truthiness check on the raw value is not enough.
    const config = readThirdPartyConfig({
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: '   ',
      NEXT_PUBLIC_META_PIXEL_ID: '',
    })
    expect(config.ga4MeasurementId).toBeNull()
    expect(config.metaPixelId).toBeNull()
  })

  it('reads both ids when set', () => {
    const config = readThirdPartyConfig({
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-ABC1234567',
      NEXT_PUBLIC_META_PIXEL_ID: '123456789012',
    })
    expect(config.ga4MeasurementId).toBe('G-ABC1234567')
    expect(config.metaPixelId).toBe('123456789012')
  })
})

describe('hasAnyThirdParty', () => {
  it('is false with nothing configured, so nothing loads even after consent', () => {
    expect(hasAnyThirdParty({ ga4MeasurementId: null, metaPixelId: null })).toBe(false)
  })

  it('is true with either one', () => {
    expect(hasAnyThirdParty({ ga4MeasurementId: 'G-X', metaPixelId: null })).toBe(true)
    expect(hasAnyThirdParty({ ga4MeasurementId: null, metaPixelId: '1' })).toBe(true)
  })
})

describe('id validation catches the values people actually paste', () => {
  it('accepts a GA4 measurement id', () => {
    expect(isGa4MeasurementId('G-ABC1234567')).toBe(true)
  })

  it('rejects a Google Ads id and a Tag Manager container', () => {
    // Both load without error and report nothing, which is the worst failure
    // mode: analytics that looks configured and is silent.
    expect(isGa4MeasurementId('AW-123456789')).toBe(false)
    expect(isGa4MeasurementId('GTM-ABC1234')).toBe(false)
    expect(isGa4MeasurementId('UA-12345-1')).toBe(false)
  })

  it('accepts a numeric Meta pixel id and rejects a name', () => {
    expect(isMetaPixelId('123456789012')).toBe(true)
    expect(isMetaPixelId('my-pixel')).toBe(false)
    expect(isMetaPixelId('123')).toBe(false)
  })

  it('treats null as invalid rather than throwing', () => {
    expect(isGa4MeasurementId(null)).toBe(false)
    expect(isMetaPixelId(null)).toBe(false)
  })
})

describe('validatedConfig', () => {
  it('drops a malformed id so a typo disables rather than misreports', () => {
    const config = validatedConfig({ ga4MeasurementId: 'GTM-WRONG', metaPixelId: 'nope' })
    expect(config).toEqual({ ga4MeasurementId: null, metaPixelId: null })
  })

  it('keeps a valid pair intact', () => {
    const input = { ga4MeasurementId: 'G-ABC1234567', metaPixelId: '123456789012' }
    expect(validatedConfig(input)).toEqual(input)
  })
})
