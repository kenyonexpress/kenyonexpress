import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import {
  buildBreadcrumbJsonLd,
  buildLocalBusinessJsonLd,
  buildProductJsonLd,
  buildSiteJsonLd,
  jsonLdScript,
} from '@/lib/seo/json-ld'
import { describe, expect, it } from 'vitest'

const SITE = 'https://kenyonexpress.co.il'

const physical = {
  name: 'אייפודס פרו דור 2',
  description: 'אוזניות אלחוטיות',
  slug: 'airpods-pro-2',
  sku: 'APP2',
  images: ['/images/airpods.jpg'],
  siteUrl: SITE,
  supplierName: 'אלקטרו פלוס',
  categoryName: 'אלקטרוניקה',
  priceIls: 799,
  fullPriceIls: 999,
  couponOffer: null,
  stockQuantity: 5,
}

const sellableCoupon: CouponOffer = {
  sellable: true,
  fullPriceIls: 200,
  paidOnlineIls: 20,
  balanceAtBusinessIls: 180,
  discountPercent: 10,
  validUntil: new Date('2026-12-31T00:00:00.000Z'),
  expiryDays: 30,
}

describe('buildProductJsonLd, physical', () => {
  it('is a Product with the offer priced in shekels', () => {
    const node = buildProductJsonLd(physical)
    expect(node['@type']).toBe('Product')
    const offer = node.offers as Record<string, unknown>
    expect(offer.price).toBe('799.00')
    expect(offer.priceCurrency).toBe('ILS')
  })

  it('carries the sticker price as highPrice only when it is actually higher', () => {
    expect((buildProductJsonLd(physical).offers as Record<string, unknown>).highPrice).toBe(
      '999.00',
    )
    const noDiscount = buildProductJsonLd({ ...physical, fullPriceIls: 799 })
    expect((noDiscount.offers as Record<string, unknown>).highPrice).toBeUndefined()
  })

  it('names the business as the brand, not the platform', () => {
    const node = buildProductJsonLd(physical)
    expect(node.brand).toEqual({ '@type': 'Brand', name: 'אלקטרו פלוס' })
    expect(JSON.stringify(node.brand)).not.toContain('KenyonExpress')
  })

  it('says out of stock only when the count actually says zero', () => {
    const zero = buildProductJsonLd({ ...physical, stockQuantity: 0 })
    expect((zero.offers as Record<string, unknown>).availability).toContain('OutOfStock')

    // Null means the product does not track stock, which is not none left.
    const untracked = buildProductJsonLd({ ...physical, stockQuantity: null })
    expect((untracked.offers as Record<string, unknown>).availability).toContain('InStock')
  })

  it('omits the offer entirely rather than advertising a price of zero', () => {
    expect(buildProductJsonLd({ ...physical, priceIls: 0 }).offers).toBeUndefined()
    expect(buildProductJsonLd({ ...physical, priceIls: null }).offers).toBeUndefined()
  })

  it('makes every image absolute so a crawler can fetch it', () => {
    const node = buildProductJsonLd(physical)
    expect(node.image).toEqual(['https://kenyonexpress.co.il/images/airpods.jpg'])
  })

  it('leaves an already absolute image alone', () => {
    const node = buildProductJsonLd({ ...physical, images: ['https://cdn.example.com/a.jpg'] })
    expect(node.image).toEqual(['https://cdn.example.com/a.jpg'])
  })

  it('drops empty image entries instead of emitting a bare origin', () => {
    const node = buildProductJsonLd({ ...physical, images: ['', '   '] })
    expect(node.image).toBeUndefined()
  })
})

describe('buildProductJsonLd, coupon', () => {
  const couponProduct = {
    ...physical,
    name: 'ארוחה בשרית',
    slug: 'meat-meal',
    priceIls: null,
    fullPriceIls: null,
    couponOffer: sellableCoupon,
    stockQuantity: null,
  }

  // The number a customer is charged on this site. Advertising the sticker
  // price would put a figure in search results nobody is ever charged.
  it('advertises what is paid online, with the sticker price alongside', () => {
    const offer = buildProductJsonLd(couponProduct).offers as Record<string, unknown>
    expect(offer.price).toBe('20.00')
    expect(offer.highPrice).toBe('200.00')
  })

  it('carries the offer deadline as a date, not the voucher expiry', () => {
    const offer = buildProductJsonLd(couponProduct).offers as Record<string, unknown>
    expect(offer.priceValidUntil).toBe('2026-12-31')
  })

  it('gives an unsellable coupon no price at all', () => {
    const unsellable: CouponOffer = {
      sellable: false,
      reason: 'missing-price',
      fullPriceIls: 200,
      validUntil: null,
    }
    const offer = buildProductJsonLd({ ...couponProduct, couponOffer: unsellable })
      .offers as Record<string, unknown>
    expect(offer.availability).toContain('OutOfStock')
    expect(offer.price).toBeUndefined()
    expect(offer.highPrice).toBeUndefined()
  })

  it('takes the coupon price from the offer object and never from priceIls', () => {
    // If a caller passes both, the coupon model wins: it is the one the
    // commission engine bills from.
    const offer = buildProductJsonLd({
      ...couponProduct,
      priceIls: 999,
      couponOffer: sellableCoupon,
    }).offers as Record<string, unknown>
    expect(offer.price).toBe('20.00')
  })
})

describe('buildBreadcrumbJsonLd', () => {
  it('numbers the trail from one and makes each item absolute', () => {
    const node = buildBreadcrumbJsonLd(
      [
        { name: 'עמוד הבית', path: '/' },
        { name: 'אלקטרוניקה', path: '/category/electronics' },
      ],
      SITE,
    )
    const items = node.itemListElement as Record<string, unknown>[]
    expect(items[0]?.position).toBe(1)
    expect(items[1]?.position).toBe(2)
    expect(items[1]?.item).toBe('https://kenyonexpress.co.il/category/electronics')
  })
})

describe('buildSiteJsonLd', () => {
  it('declares the search action against the route that answers', () => {
    const website = buildSiteJsonLd(SITE).find((node) => node['@type'] === 'WebSite')
    const action = website?.potentialAction as Record<string, unknown>
    const target = action.target as Record<string, unknown>
    expect(target.urlTemplate).toBe('https://kenyonexpress.co.il/search?q={search_term_string}')
  })

  it('does not produce a double slash from a trailing slash in the origin', () => {
    for (const node of buildSiteJsonLd('https://kenyonexpress.co.il/')) {
      expect(JSON.stringify(node)).not.toContain('.co.il//')
    }
  })
})

describe('jsonLdScript', () => {
  // A product name containing </script> would otherwise close the tag and turn
  // catalogue text into markup.
  it('escapes every angle bracket so catalogue text cannot close the tag', () => {
    const serialised = jsonLdScript(
      buildProductJsonLd({ ...physical, name: '</script><img src=x onerror=alert(1)>' }),
    )
    expect(serialised).not.toContain('</script>')
    expect(serialised).not.toContain('<img')
    expect(serialised).toContain('\\u003c')
  })

  it('still parses back to the same object', () => {
    const node = buildProductJsonLd(physical)
    expect(JSON.parse(jsonLdScript(node))).toEqual(node)
  })
})

describe('LocalBusiness for a supplier storefront', () => {
  const base = {
    id: 'sup-1',
    name: 'פלאפל הכיכר',
    address: 'הרצל 12',
    city: 'רמת גן',
    telephone: '03-1234567',
    logoUrl: 'https://cdn.example.com/logo.png',
    siteUrl: SITE,
  }

  it('is a LocalBusiness and not an Organization, because it is a place you walk into', () => {
    const node = buildLocalBusinessJsonLd(base)
    expect(node['@type']).toBe('LocalBusiness')
    expect(node.name).toBe('פלאפל הכיכר')
    expect(node.url).toBe(`${SITE}/s/sup-1`)
  })

  it('carries the street and the city as a PostalAddress', () => {
    expect(buildLocalBusinessJsonLd(base).address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'IL',
      streetAddress: 'הרצל 12',
      addressLocality: 'רמת גן',
    })
  })

  it('omits the address entirely rather than asserting only a country', () => {
    // suppliers.address is null for most rows today. A PostalAddress carrying
    // nothing but addressCountry claims this business is somewhere in Israel,
    // which is a structured-data claim with no content in it.
    const node = buildLocalBusinessJsonLd({ ...base, address: null, city: null })
    expect(node.address).toBeUndefined()
  })

  it('keeps the city when only the city is known', () => {
    expect(buildLocalBusinessJsonLd({ ...base, address: null }).address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'IL',
      addressLocality: 'רמת גן',
    })
  })

  it('omits telephone and image when there is none, never an empty string', () => {
    const node = buildLocalBusinessJsonLd({ ...base, telephone: null, logoUrl: null })
    expect(node).not.toHaveProperty('telephone')
    expect(node).not.toHaveProperty('image')
  })

  it('treats whitespace as absent, so a blank column is not a claim', () => {
    const node = buildLocalBusinessJsonLd({
      ...base,
      address: '   ',
      city: '  ',
      telephone: ' ',
      logoUrl: '  ',
    })
    expect(node.address).toBeUndefined()
    expect(node).not.toHaveProperty('telephone')
    expect(node).not.toHaveProperty('image')
  })

  it('invents no priceRange, openingHours or geo', () => {
    // The database holds none of the three. Google prints priceRange verbatim,
    // so a fabricated one is a made-up figure in a search result, and invented
    // hours send somebody to a closed shop. W34 models branches properly.
    const node = buildLocalBusinessJsonLd(base)
    expect(node).not.toHaveProperty('priceRange')
    expect(node).not.toHaveProperty('openingHours')
    expect(node).not.toHaveProperty('openingHoursSpecification')
    expect(node).not.toHaveProperty('geo')
  })

  it('escapes into a script tag without closing it', () => {
    const html = jsonLdScript(buildLocalBusinessJsonLd({ ...base, name: 'א</script>ב' }))
    expect(html).not.toContain('</script>')
  })

  it('percent-encodes an id so the url cannot be broken by one', () => {
    expect(buildLocalBusinessJsonLd({ ...base, id: 'a b/c' }).url).toBe(`${SITE}/s/a%20b%2Fc`)
  })
})
