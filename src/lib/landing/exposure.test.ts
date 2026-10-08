import { afterEach, describe, expect, it } from 'vitest'
import {
  clearLandingExposure,
  currentLandingExposure,
  landingPageViewProps,
  setLandingExposure,
} from './exposure'

afterEach(() => clearLandingExposure())

describe('landing exposure', () => {
  it('is empty before any landing page rendered', () => {
    expect(currentLandingExposure()).toBeNull()
    expect(landingPageViewProps('/lp/welcome')).toEqual({})
  })

  it('stamps the slug, the variant and the $feature property on the landing pathname', () => {
    setLandingExposure({ slug: 'summer-2026', variant: 'b' })
    expect(landingPageViewProps('/lp/summer-2026')).toEqual({
      lp_slug: 'summer-2026',
      lp_variant: 'b',
      '$feature/lp_summer_2026': 'b',
    })
  })

  it('stamps nothing on any other pathname, so a variant cannot follow the visitor', () => {
    setLandingExposure({ slug: 'summer-2026', variant: 'b' })
    expect(landingPageViewProps('/products')).toEqual({})
    expect(landingPageViewProps('/lp/other')).toEqual({})
    expect(landingPageViewProps('/lp/summer-2026/')).toEqual({})
  })

  it('forgets on clear', () => {
    setLandingExposure({ slug: 'welcome', variant: 'control' })
    clearLandingExposure()
    expect(landingPageViewProps('/lp/welcome')).toEqual({})
  })
})
