import { describe, expect, it } from 'vitest'
import { locationPinHref } from './waze-pin'

describe('locationPinHref', () => {
  it('prefers coordinates', () => {
    expect(
      locationPinHref({ latitude: 32.08, longitude: 34.78, fullAddress: 'הרצל 1, תל אביב' }),
    ).toBe('https://waze.com/ul?ll=32.08,34.78&navigate=yes')
  })
  it('falls back to the encoded address', () => {
    expect(locationPinHref({ fullAddress: 'הרצל 1, חיפה' })).toBe(
      `https://waze.com/ul?q=${encodeURIComponent('הרצל 1, חיפה')}`,
    )
  })
  it('has no link for a city alone or out-of-range coordinates', () => {
    expect(locationPinHref({ city: 'חיפה' })).toBeNull()
    expect(locationPinHref({ latitude: 400, longitude: 34 })).toBeNull()
    expect(locationPinHref({ latitude: null, longitude: 34 })).toBeNull()
  })
  it('accepts zero as a coordinate', () => {
    expect(locationPinHref({ latitude: 0, longitude: 0 })).toBe(
      'https://waze.com/ul?ll=0,0&navigate=yes',
    )
  })
})
