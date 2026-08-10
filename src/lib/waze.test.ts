import { describe, expect, it } from 'vitest'
import { wazeSearchLink } from './waze'

describe('wazeSearchLink', () => {
  it('builds a navigating search link from address and city', () => {
    const href = wazeSearchLink('הרצל 5', 'חיפה')
    expect(href).toBe(`https://waze.com/ul?q=${encodeURIComponent('הרצל 5, חיפה')}&navigate=yes`)
  })

  it('does not repeat a city the address already carries', () => {
    // Waze scores "הרצל 5, חיפה, חיפה" as a different place than the address.
    expect(wazeSearchLink('הרצל 5, חיפה', 'חיפה')).toBe(
      `https://waze.com/ul?q=${encodeURIComponent('הרצל 5, חיפה')}&navigate=yes`,
    )
  })

  it('returns null for a city with no street address', () => {
    // The whole point: `q=חיפה` navigates to a city centre, which is not where
    // the coupon is redeemed. Better no button than a confident wrong one.
    expect(wazeSearchLink(null, 'חיפה')).toBeNull()
    expect(wazeSearchLink('   ', 'חיפה')).toBeNull()
  })

  it('works with an address and no city', () => {
    expect(wazeSearchLink('דיזנגוף 100', null)).toBe(
      `https://waze.com/ul?q=${encodeURIComponent('דיזנגוף 100')}&navigate=yes`,
    )
  })
})
