import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import type { FeedProduct } from './catalogue'
import { buildRssFeed } from './rss'

const parser = new XMLParser({ ignoreAttributes: false })

const OPTIONS = {
  siteUrl: 'https://kenyonexpress.co.il/',
  title: 'KenyonExpress — דילים חדשים',
  description: 'הדילים החדשים',
  selfUrl: 'https://kenyonexpress.co.il/feed.xml',
  builtAt: new Date('2026-08-06T09:00:00Z'),
}

function deal(overrides: Partial<FeedProduct> = {}): FeedProduct {
  return {
    slug: 'meal-for-two',
    name: 'ארוחה זוגית',
    description: 'שובר לארוחה',
    imageUrl: 'https://images.unsplash.com/photo-1.jpg',
    brand: 'מסעדת הים',
    gtin: null,
    sku: null,
    condition: null,
    type: 'coupon',
    publishedAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-02T09:00:00Z'),
    fullPriceIls: 200,
    payableIls: 80,
    inStock: true,
    offer: {
      sellable: true,
      fullPriceIls: 200,
      paidOnlineIls: 80,
      balanceAtBusinessIls: 120,
      discountPercent: 60,
      validUntil: null,
      expiryDays: null,
    },
    ...overrides,
  }
}

function channel(xml: string): Record<string, unknown> {
  return (parser.parse(xml) as { rss: { channel: Record<string, unknown> } }).rss.channel
}

function items(xml: string): Record<string, unknown>[] {
  const item = channel(xml).item as Record<string, unknown> | Record<string, unknown>[] | undefined
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

describe('the channel', () => {
  it('is well-formed RSS 2.0 with a Hebrew language tag', () => {
    const parsed = parser.parse(buildRssFeed([deal()], OPTIONS)) as {
      rss: { '@_version': string }
    }
    expect(parsed.rss['@_version']).toBe('2.0')
    // `he` is the correct RFC 5646 tag. `iw` is the legacy one Google Wallet
    // still wants, and the two live in different files on purpose.
    expect(channel(buildRssFeed([deal()], OPTIONS)).language).toBe('he')
  })

  it('carries a self link, so the same feed reached twice is one feed', () => {
    // Without it, a feed fetched through a proxy or a trailing slash is a second
    // subscription with every item unread again.
    const xml = buildRssFeed([deal()], OPTIONS)
    const link = channel(xml)['atom:link'] as Record<string, string>
    expect(link['@_href']).toBe(OPTIONS.selfUrl)
    expect(link['@_rel']).toBe('self')
  })

  it('strips the trailing slash off the site link', () => {
    expect(channel(buildRssFeed([deal()], OPTIONS)).link).toBe('https://kenyonexpress.co.il')
  })

  it('is well-formed with no items at all', () => {
    const xml = buildRssFeed([], OPTIONS)
    expect(() => parser.parse(xml)).not.toThrow()
    expect(items(xml)).toEqual([])
  })
})

describe('an item', () => {
  it('links to the product page and uses that as its permalink guid', () => {
    // A guid that changed with the price would re-notify every subscriber on
    // every edit.
    const [item] = items(buildRssFeed([deal()], OPTIONS))
    const url = 'https://kenyonexpress.co.il/product/meal-for-two'
    expect(item?.link).toBe(url)
    expect((item?.guid as Record<string, unknown>)['#text']).toBe(url)
    expect((item?.guid as Record<string, string>)['@_isPermaLink']).toBe('true')
  })

  it('states what is paid online AND what is due at the business', () => {
    // A line that said only "80 ₪" puts a customer at a counter expecting to owe
    // nothing — the same mistake `coupon-offer.ts` exists to stop.
    const description = items(buildRssFeed([deal()], OPTIONS))[0]?.description as string
    expect(description).toContain('80.00 ₪')
    expect(description).toContain('120.00 ₪')
  })

  it('says nothing about a balance when there is none', () => {
    const description = items(
      buildRssFeed(
        [
          deal({
            offer: {
              sellable: true,
              fullPriceIls: 80,
              paidOnlineIls: 80,
              balanceAtBusinessIls: 0,
              discountPercent: 0,
              validUntil: null,
              expiryDays: null,
            },
          }),
        ],
        OPTIONS,
      ),
    )[0]?.description as string
    expect(description).not.toContain('בבית העסק')
  })

  it('quotes a plain price for a product that is not a coupon', () => {
    const description = items(
      buildRssFeed([deal({ offer: null, payableIls: 49.9, type: 'physical' })], OPTIONS),
    )[0]?.description as string
    expect(description).toContain('49.90 ₪')
  })

  it('omits pubDate rather than inventing one', () => {
    const [item] = items(buildRssFeed([deal({ publishedAt: null })], OPTIONS))
    expect(item?.pubDate).toBeUndefined()
  })

  it('omits the enclosure when there is no image', () => {
    const [item] = items(buildRssFeed([deal({ imageUrl: null })], OPTIONS))
    expect(item?.enclosure).toBeUndefined()
  })

  it('survives a Hebrew name containing an ampersand', () => {
    const [item] = items(buildRssFeed([deal({ name: 'קפה & מאפה' })], OPTIONS))
    expect(item?.title).toBe('קפה & מאפה')
  })

  it('survives a description containing markup', () => {
    const [item] = items(buildRssFeed([deal({ description: 'ראו <b>כאן</b> & עוד' })], OPTIONS))
    expect(item?.description).toContain('<b>כאן</b>')
  })

  it('percent-encodes a slug that needs it', () => {
    const [item] = items(buildRssFeed([deal({ slug: 'ארוחה זוגית' })], OPTIONS))
    expect(item?.link).toBe(
      `https://kenyonexpress.co.il/product/${encodeURIComponent('ארוחה זוגית')}`,
    )
  })
})

describe('the enclosure', () => {
  it('absolutises a site-relative image path', () => {
    // A reader fetches an enclosure from wherever it is subscribed, so a
    // relative path resolves against the reader's origin, not ours.
    const [item] = items(buildRssFeed([deal({ imageUrl: '/images/products/x.webp' })], OPTIONS))
    expect((item?.enclosure as Record<string, string>)['@_url']).toBe(
      'https://kenyonexpress.co.il/images/products/x.webp',
    )
  })
})
