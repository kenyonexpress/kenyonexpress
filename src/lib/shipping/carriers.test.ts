import { describe, expect, it } from 'vitest'
import { carrierTrackingUrl, resolveCarrier } from './carriers'

describe('resolveCarrier', () => {
  it('deep-links Israel Post with the number embedded', () => {
    const resolved = resolveCarrier('דואר ישראל', 'RR123456789IL')
    expect(resolved).toEqual({
      label: 'דואר ישראל',
      url: 'https://israelpost.co.il/itemtrace/?itemcode=RR123456789IL',
    })
  })

  it('is forgiving about case, spacing and punctuation in the alias', () => {
    for (const spelled of ['Israel Post', 'ISRAELPOST', ' israel-post ', 'דואר  ישראל']) {
      expect(resolveCarrier(spelled, 'X1')?.label).toBe('דואר ישראל')
    }
    expect(resolveCarrier("צ'יטה", 'X1')?.label).toBe("צ'יטה שליחויות")
  })

  it('links local couriers to their tracking page without embedding the number', () => {
    // Their deep-link formats churn; a stale deep link is a dead end.
    const resolved = resolveCarrier('HFD', 'ABC123')
    expect(resolved?.url).toBe('https://hfd.co.il/tracking/')
    expect(resolved?.url).not.toContain('ABC123')
  })

  it('keeps an unrecognised carrier as a label with no link', () => {
    // A wrong guess sends the customer to the wrong courier's site.
    expect(resolveCarrier('שליח מקומי של הספק', 'X9')).toEqual({
      label: 'שליח מקומי של הספק',
      url: null,
    })
  })

  it('drops the deep link when there is no tracking number to embed', () => {
    expect(resolveCarrier('ups', null)).toEqual({ label: 'UPS', url: null })
    expect(resolveCarrier('ups', '   ')).toEqual({ label: 'UPS', url: null })
  })

  it('returns null for a missing or blank carrier', () => {
    expect(resolveCarrier(null, 'X1')).toBeNull()
    expect(resolveCarrier('  ', 'X1')).toBeNull()
  })

  it('URL-encodes the tracking number so free text cannot break the link', () => {
    expect(carrierTrackingUrl('fedex', 'a b&c')).toBe(
      'https://www.fedex.com/fedextrack/?trknbr=a%20b%26c',
    )
  })
})
