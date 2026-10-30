import { describe, expect, it } from 'vitest'
import { businessGoogleMapsHref, businessWazeHref } from './business-location'

describe('business location links', () => {
  it('falls back to the display name', () => {
    expect(businessWazeHref({} as NodeJS.ProcessEnv)).toContain('waze.com/ul?q=')
    expect(businessGoogleMapsHref({} as NodeJS.ProcessEnv)).toContain('google.com/maps/search')
  })
  it('prefers the configured address', () => {
    const env = { NEXT_PUBLIC_BUSINESS_ADDRESS: 'הרצל 5, חיפה' } as unknown as NodeJS.ProcessEnv
    expect(businessWazeHref(env)).toContain(encodeURIComponent('הרצל 5, חיפה'))
    expect(businessGoogleMapsHref(env)).toContain(encodeURIComponent('הרצל 5, חיפה'))
  })
})
