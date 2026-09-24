import { describe, expect, it } from 'vitest'
import { attributedShareUrl } from './share-url'

describe('attributedShareUrl', () => {
  it('appends ?ref= with the code, keeping the page and its query', () => {
    expect(
      attributedShareUrl('https://kenyonexpress.co.il/product/barbecue-2?near=1', 'abcd2345'),
    ).toBe('https://kenyonexpress.co.il/product/barbecue-2?near=1&ref=ABCD2345')
  })

  it('replaces a code already on the page: the sharer is the last touch', () => {
    expect(attributedShareUrl('https://x.test/?ref=ZZZZ9999', 'ABCD2345')).toBe(
      'https://x.test/?ref=ABCD2345',
    )
  })

  it('leaves the URL alone without a code or with one outside the 098 alphabet', () => {
    expect(attributedShareUrl('https://x.test/p', null)).toBe('https://x.test/p')
    expect(attributedShareUrl('https://x.test/p', 'ILOU1111')).toBe('https://x.test/p')
    expect(attributedShareUrl('https://x.test/p', 'short')).toBe('https://x.test/p')
  })

  it('returns an unparseable href unchanged rather than throwing in a click handler', () => {
    expect(attributedShareUrl('not a url', 'ABCD2345')).toBe('not a url')
  })
})
