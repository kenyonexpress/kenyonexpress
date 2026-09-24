import { describe, expect, it } from 'vitest'
import { describeOriginalPriceSource, googleReviewsHref } from './original-price-source'

describe('describeOriginalPriceSource', () => {
  it('returns the trimmed label with no link when only a label is stored', () => {
    expect(describeOriginalPriceSource({ label: '  מחירון היצרן ' })).toEqual({
      label: 'מחירון היצרן',
      href: null,
    })
  })

  it('keeps an https evidence link', () => {
    expect(
      describeOriginalPriceSource({
        label: 'מחיר באתר הספק',
        url: 'https://example.co.il/catalog/item-7',
      }),
    ).toEqual({ label: 'מחיר באתר הספק', href: 'https://example.co.il/catalog/item-7' })
  })

  it('drops a link that is not https, without dropping the label', () => {
    for (const url of ['http://example.co.il/x', 'javascript:alert(1)', 'not a url', '']) {
      expect(describeOriginalPriceSource({ label: 'מחירון', url })).toEqual({
        label: 'מחירון',
        href: null,
      })
    }
  })

  it('renders nothing for a missing, blank or one-character label, even with a URL', () => {
    expect(describeOriginalPriceSource({ label: null, url: 'https://a.b/c' })).toBeNull()
    expect(describeOriginalPriceSource({ label: '   ' })).toBeNull()
    expect(describeOriginalPriceSource({ label: 'x' })).toBeNull()
    expect(describeOriginalPriceSource({ label: undefined })).toBeNull()
  })

  it('refuses a label past the column bound', () => {
    expect(describeOriginalPriceSource({ label: 'א'.repeat(121) })).toBeNull()
    expect(describeOriginalPriceSource({ label: 'א'.repeat(120) })?.label).toHaveLength(120)
  })
})

describe('googleReviewsHref', () => {
  it('accepts the hosts Google publishes reviews under', () => {
    for (const url of [
      'https://www.google.com/maps/place/x/@1,2/data=!3m1',
      'https://google.co.il/search?q=x#lrd=0x0:0x0,1',
      'https://maps.app.goo.gl/AbCdEf',
      'https://g.page/r/AbCdEf/review',
      'https://search.google.com/local/reviews?placeid=ChIJ',
    ]) {
      expect(googleReviewsHref(url), url).toBe(new URL(url).toString())
    }
  })

  it('refuses every other host and every non-https scheme', () => {
    for (const url of [
      'https://example.com/google.com/reviews',
      'https://notgoogle.com/x',
      'https://google.com.evil.io/x',
      'http://www.google.com/maps',
      'javascript:alert(1)',
      '',
      null,
      42,
    ]) {
      expect(googleReviewsHref(url), String(url)).toBeNull()
    }
  })
})
