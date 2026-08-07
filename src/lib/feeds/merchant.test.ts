import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import type { FeedProduct } from './catalogue'
import { buildMerchantFeed } from './merchant'

/**
 * The consequence of getting this file wrong is not a broken page, it is a
 * suspended Merchant account: Google re-crawls the landing page and compares
 * the price it finds against `g:price`. So the assertions here are about which
 * number is published and which items are refused, and every one of them parses
 * the XML rather than matching a substring.
 */

const parser = new XMLParser({ ignoreAttributes: false })

const OPTIONS = {
  siteUrl: 'https://kenyonexpress.co.il/',
  title: 'KenyonExpress',
  description: 'קטלוג',
  builtAt: new Date(0),
}

function coupon(overrides: Partial<FeedProduct> = {}): FeedProduct {
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

function items(xml: string): Record<string, unknown>[] {
  const parsed = parser.parse(xml) as {
    rss: { channel: { item?: Record<string, unknown> | Record<string, unknown>[] } }
  }
  const item = parsed.rss.channel.item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

describe('the price, which is the field that suspends accounts', () => {
  it('publishes what checkout charges, not the sticker price', () => {
    // A coupon's `price_ils` is what the goods cost at the business. Publishing
    // it advertises ₪200 for something the checkout bills ₪80 for, and Google
    // compares the two.
    const [item] = items(buildMerchantFeed([coupon()], OPTIONS).xml)
    expect(item?.['g:sale_price']).toBe('80.00 ILS')
    expect(item?.['g:price']).toBe('200.00 ILS')
  })

  it('emits one price when nothing is actually discounted', () => {
    // `price == sale_price` renders a strike-through on a number that never
    // moved: a claim about a saving that does not exist.
    const [item] = items(
      buildMerchantFeed([coupon({ fullPriceIls: 80, payableIls: 80 })], OPTIONS).xml,
    )
    expect(item?.['g:price']).toBe('80.00 ILS')
    expect(item?.['g:sale_price']).toBeUndefined()
  })

  it('never emits a sale price above the price', () => {
    const [item] = items(
      buildMerchantFeed([coupon({ fullPriceIls: 50, payableIls: 80 })], OPTIONS).xml,
    )
    expect(item?.['g:price']).toBe('80.00 ILS')
    expect(item?.['g:sale_price']).toBeUndefined()
  })

  it('formats as number then currency, with two decimals', () => {
    const [item] = items(
      buildMerchantFeed([coupon({ fullPriceIls: null, payableIls: 12.5 })], OPTIONS).xml,
    )
    expect(item?.['g:price']).toBe('12.50 ILS')
  })
})

describe('what is refused rather than guessed at', () => {
  it('drops a product with no price and says which', () => {
    const feed = buildMerchantFeed([coupon({ payableIls: null, slug: 'no-price' })], OPTIONS)
    expect(feed.included).toBe(0)
    expect(feed.excluded).toEqual([{ slug: 'no-price', reason: 'no_price' }])
  })

  it('drops a product with no image, which Google would disapprove anyway', () => {
    const feed = buildMerchantFeed([coupon({ imageUrl: null, slug: 'no-image' })], OPTIONS)
    expect(feed.included).toBe(0)
    expect(feed.excluded).toEqual([{ slug: 'no-image', reason: 'no_image' }])
  })

  it('keeps counting so a shrinking feed has a reason attached', () => {
    // A feed that quietly shrinks is indistinguishable from a catalogue that
    // shrank, and this count is the only thing that separates them.
    const feed = buildMerchantFeed(
      [coupon(), coupon({ slug: 'a', payableIls: null }), coupon({ slug: 'b', imageUrl: null })],
      OPTIONS,
    )
    expect(feed.included).toBe(1)
    expect(feed.excluded).toHaveLength(2)
  })

  it('still produces a well-formed empty feed when everything is refused', () => {
    const feed = buildMerchantFeed([coupon({ payableIls: null })], OPTIONS)
    expect(() => parser.parse(feed.xml)).not.toThrow()
    expect(items(feed.xml)).toEqual([])
  })
})

describe('the rest of the item', () => {
  it('keys on the slug, so an item keeps its history', () => {
    // Google tracks an item against `g:id`. Changing the scheme reads as every
    // product being deleted and re-added.
    const [item] = items(buildMerchantFeed([coupon()], OPTIONS).xml)
    expect(item?.['g:id']).toBe('meal-for-two')
  })

  it('links to the product page on this origin, with no doubled slash', () => {
    const [item] = items(buildMerchantFeed([coupon()], OPTIONS).xml)
    expect(item?.['g:link']).toBe('https://kenyonexpress.co.il/product/meal-for-two')
  })

  it('says out_of_stock rather than omitting availability', () => {
    const [item] = items(buildMerchantFeed([coupon({ inStock: false })], OPTIONS).xml)
    expect(item?.['g:availability']).toBe('out_of_stock')
  })

  it('normalises an unrecognised condition instead of failing the item', () => {
    // `g:condition` is an enum. Free text there is a disapproval, and
    // everything sold here is new unless a shop says otherwise.
    const [item] = items(buildMerchantFeed([coupon({ condition: 'כמו חדש' })], OPTIONS).xml)
    expect(item?.['g:condition']).toBe('new')
  })

  it('passes a condition Google does recognise straight through', () => {
    const [item] = items(buildMerchantFeed([coupon({ condition: 'Refurbished' })], OPTIONS).xml)
    expect(item?.['g:condition']).toBe('refurbished')
  })

  it('declares identifier_exists=no when there is no GTIN and no MPN', () => {
    // The default Google assumes is the opposite one, so silence here reads as
    // "we have identifiers and did not send them".
    const [item] = items(buildMerchantFeed([coupon()], OPTIONS).xml)
    expect(item?.['g:identifier_exists']).toBe('no')
  })

  it('declares yes once a barcode exists', () => {
    const [item] = items(buildMerchantFeed([coupon({ gtin: '7290000000001' })], OPTIONS).xml)
    expect(item?.['g:identifier_exists']).toBe('yes')
    expect(item?.['g:gtin']).toBe(7290000000001)
  })

  it('survives a Hebrew name containing an ampersand', () => {
    const [item] = items(buildMerchantFeed([coupon({ name: 'קפה & מאפה' })], OPTIONS).xml)
    expect(item?.['g:title']).toBe('קפה & מאפה')
  })

  it('falls back to the name when a product has no description', () => {
    // `g:description` is required. An empty one is a disapproval.
    const [item] = items(buildMerchantFeed([coupon({ description: null })], OPTIONS).xml)
    expect(item?.['g:description']).toBe('ארוחה זוגית')
  })
})

describe('image links, which the first build got wrong against production', () => {
  it('absolutises a site-relative path', () => {
    // 27 of the 46 active physical products store one. Google cannot fetch a
    // relative URL, so that was nearly half the feed disapproved — and it
    // looked correct at every layer above: the column holds that value,
    // `isAllowedImageUrl` accepts it, and the XML was well-formed.
    const [item] = items(
      buildMerchantFeed([coupon({ imageUrl: '/images/products/x.webp' })], OPTIONS).xml,
    )
    expect(item?.['g:image_link']).toBe('https://kenyonexpress.co.il/images/products/x.webp')
  })

  it('leaves an already-absolute URL alone', () => {
    const [item] = items(buildMerchantFeed([coupon()], OPTIONS).xml)
    expect(item?.['g:image_link']).toBe('https://images.unsplash.com/photo-1.jpg')
  })
})
