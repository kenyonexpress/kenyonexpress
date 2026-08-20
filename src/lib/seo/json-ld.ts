import type { CouponOffer } from '@/lib/commerce/coupon-offer'

/**
 * Structured data, built from the same values the page renders.
 *
 * WHY IT IS DERIVED AND NOT WRITTEN. A JSON-LD price is a public claim about
 * what something costs, read by Google and shown in results. If it is computed
 * separately from what the page charges, the two drift and the claim becomes
 * false without anybody seeing it: this repo has already shipped a product page
 * that rendered `price * 0.1` while the cart charged the real amount. So the
 * coupon price here comes from `CouponOffer`, the object the commission engine
 * and the page already share, and never from a second calculation.
 *
 * WHAT PRICE A COUPON ADVERTISES. `paidOnlineIls`, the amount actually charged
 * on this site, with the sticker price carried alongside as the strikethrough.
 * A coupon that advertised the sticker price would put a number in search
 * results that nobody is ever charged, and a coupon that advertised only the
 * online amount without context would promise a whole meal for the deposit.
 * Both appear: `price` is what is paid here, `highPrice` is the sticker.
 *
 * A coupon that cannot be sold gets NO offer node at all rather than an offer
 * priced at zero. `availability: OutOfStock` with no price is the honest
 * encoding, and a zero price is an advertisement for free goods.
 *
 * Pure and synchronous. Everything it needs is passed in, so the output can be
 * asserted exactly.
 */

export interface JsonLdNode {
  '@context'?: string
  '@type': string
  [key: string]: unknown
}

export interface ProductJsonLdInput {
  name: string
  description: string | null
  slug: string
  sku: string | null
  images: readonly string[]
  /** Origin with no trailing slash. */
  siteUrl: string
  /** The business selling it, when it is known. */
  supplierName: string | null
  categoryName: string | null
  /** Physical products only: what the site charges, in shekels. */
  priceIls: number | null
  /** Physical products only: the sticker price, when it is higher. */
  fullPriceIls: number | null
  /** Coupons only. Its own model decides the price. */
  couponOffer: CouponOffer | null
  /** Physical stock. Null when the concept does not apply. */
  stockQuantity: number | null
}

const SCHEMA = 'https://schema.org'
const IN_STOCK = `${SCHEMA}/InStock`
const OUT_OF_STOCK = `${SCHEMA}/OutOfStock`

function trimSite(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '')
}

/** Two decimals, dot separator. Schema.org wants a number, not a formatted one. */
function price(value: number): string {
  return value.toFixed(2)
}

function absolute(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${trimSite(siteUrl)}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * `Product`, with an `Offer` when there is something honest to say about price.
 */
export function buildProductJsonLd(input: ProductJsonLdInput): JsonLdNode {
  const site = trimSite(input.siteUrl)
  const url = `${site}/product/${encodeURIComponent(input.slug)}`

  const node: JsonLdNode = {
    '@context': SCHEMA,
    '@type': 'Product',
    name: input.name,
    url,
  }

  if (input.description) node.description = input.description
  if (input.sku) node.sku = input.sku
  if (input.categoryName) node.category = input.categoryName

  const images = input.images.filter((src) => typeof src === 'string' && src.trim() !== '')
  if (images.length > 0) node.image = images.map((src) => absolute(site, src))

  // The business is the brand a customer recognises. Falling back to the
  // platform name would tell search engines every product is our own.
  if (input.supplierName) {
    node.brand = { '@type': 'Brand', name: input.supplierName }
  }

  const offer = buildOfferNode(input, url)
  if (offer) node.offers = offer

  return node
}

function buildOfferNode(input: ProductJsonLdInput, url: string): JsonLdNode | null {
  const seller = input.supplierName
    ? { '@type': 'Organization', name: input.supplierName }
    : undefined

  if (input.couponOffer) {
    // Not sellable: say so without naming a price.
    if (!input.couponOffer.sellable) {
      return {
        '@type': 'Offer',
        url,
        priceCurrency: 'ILS',
        availability: OUT_OF_STOCK,
        ...(seller ? { seller } : {}),
      }
    }

    const offer: JsonLdNode = {
      '@type': 'Offer',
      url,
      priceCurrency: 'ILS',
      price: price(input.couponOffer.paidOnlineIls),
      availability: IN_STOCK,
      ...(seller ? { seller } : {}),
    }
    if (input.couponOffer.fullPriceIls > input.couponOffer.paidOnlineIls) {
      offer.highPrice = price(input.couponOffer.fullPriceIls)
    }
    // The offer's own deadline, not the issued voucher's. They differ, and the
    // one a search result should carry is how long the price stands.
    if (input.couponOffer.validUntil) {
      offer.priceValidUntil = input.couponOffer.validUntil.toISOString().slice(0, 10)
    }
    return offer
  }

  if (input.priceIls === null || !Number.isFinite(input.priceIls) || input.priceIls <= 0) {
    return null
  }

  const offer: JsonLdNode = {
    '@type': 'Offer',
    url,
    priceCurrency: 'ILS',
    price: price(input.priceIls),
    // Null stock means the product does not track it, which is not the same as
    // none left. Only a number that says zero says out of stock.
    availability:
      input.stockQuantity !== null && input.stockQuantity <= 0 ? OUT_OF_STOCK : IN_STOCK,
    ...(seller ? { seller } : {}),
  }
  if (input.fullPriceIls !== null && input.fullPriceIls > input.priceIls) {
    offer.highPrice = price(input.fullPriceIls)
  }
  return offer
}

export interface BreadcrumbEntry {
  name: string
  /** Site-relative path, e.g. `/product/x`. */
  path: string
}

/** `BreadcrumbList`, in the order the page shows it. */
export function buildBreadcrumbJsonLd(entries: readonly BreadcrumbEntry[], siteUrl: string) {
  const site = trimSite(siteUrl)
  return {
    '@context': SCHEMA,
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absolute(site, entry.path),
    })),
  }
}

/**
 * `Organization` and `WebSite` for the home page.
 *
 * `SearchAction` points at the search route that exists (`/search?q=`). A
 * sitelinks searchbox declared against a route that does not answer is worse
 * than none: it is a promise the site fails in front of the person who uses it.
 */
export function buildSiteJsonLd(siteUrl: string): JsonLdNode[] {
  const site = trimSite(siteUrl)
  return [
    {
      '@context': SCHEMA,
      '@type': 'Organization',
      name: 'KenyonExpress',
      url: site,
      logo: `${site}/logo.png`,
    },
    {
      '@context': SCHEMA,
      '@type': 'WebSite',
      name: 'KenyonExpress',
      url: site,
      inLanguage: 'he-IL',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${site}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ]
}

/**
 * Serialised for a `<script type="application/ld+json">`.
 *
 * `<` is escaped because a product name containing `</script>` would otherwise
 * close the tag and turn catalogue text into markup. JSON.stringify alone does
 * not do this; it is the one sanitisation this file owes.
 */
export function jsonLdScript(node: JsonLdNode | JsonLdNode[] | Record<string, unknown>): string {
  return JSON.stringify(node).replace(/</g, '\\u003c')
}

export interface CollectionPageJsonLdInput {
  /** The category's Hebrew name, as the H1 prints it. */
  name: string
  description: string | null
  /** Site-relative path of the archive, with no query string. */
  path: string
  /** Origin with no trailing slash. */
  siteUrl: string
  /** The products this page is currently showing, in the order it shows them. */
  items: readonly { name: string; slug: string }[]
  /** How many products the category holds in total, across every page. */
  total: number
}

/**
 * `CollectionPage` + the `ItemList` of what is on screen.
 *
 * WHAT `position` COUNTS. The list is the products of THIS page of the archive,
 * numbered from 1, not from `(page - 1) * 12`. The node is emitted with the
 * canonical of the unfiltered category (see `generateMetadata` in
 * `category/[slug]/page.tsx`), so a crawler that reads page 3 is being told
 * about a URL whose first twelve products are a different twelve. Numbering
 * from 1 keeps the list consistent with the URL it names; carrying the global
 * offset would describe page 3's products as items 25-36 of a page that shows
 * items 1-12.
 *
 * `numberOfItems` is the ItemList's own length for the same reason, and the
 * category total rides on the CollectionPage as a plain count.
 *
 * Names and slugs only. A price in here would be a second place where a price
 * is computed, which is the defect the note at the top of this file exists to
 * prevent - the archive card and the PDP disagree about coupon pricing by
 * design (`paidOnlineIls` vs sticker), so an ItemList that quoted either would
 * contradict one of them.
 */
export function buildCollectionPageJsonLd(input: CollectionPageJsonLdInput): JsonLdNode {
  const site = trimSite(input.siteUrl)
  const url = absolute(site, input.path)

  const node: JsonLdNode = {
    '@context': SCHEMA,
    '@type': 'CollectionPage',
    name: input.name,
    url,
    inLanguage: 'he-IL',
    isPartOf: { '@type': 'WebSite', url: site },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: `${site}/product/${encodeURIComponent(item.slug)}`,
      })),
    },
  }

  const description = input.description?.trim()
  if (description) node.description = description
  if (Number.isFinite(input.total) && input.total > 0) node.numberOfItems = input.total

  return node
}

export interface LocalBusinessJsonLdInput {
  /** The business name, as the supplier block prints it. */
  name: string
  /** Street address, when the row carries one. */
  address: string | null
  city: string | null
  telephone: string | null
  /** Absolute logo URL, when there is one. */
  logoUrl: string | null
  /** The page the business appears on, site-relative. */
  path: string
  /** Origin with no trailing slash. */
  siteUrl: string
}

/**
 * `LocalBusiness` for the supplier a product is redeemed at.
 *
 * WHY IT LIVES ON THE PRODUCT PAGE AND NOT ON A PAGE OF ITS OWN. There is no
 * public supplier route to put it on, and there cannot be one from the
 * storefront alone: `suppliers` is admin-only under RLS (see
 * `loadSupplierPublicContact` in `lib/product-detail.ts`, which reaches it
 * through the service client), and the table has no slug column to address a
 * row by. The business's shopfront details are already public on this page and
 * required to be - a coupon is redeemed at a counter - so this describes the
 * business exactly where the site already names it.
 *
 * IT IS NOT EMITTED FOR A NAME ALONE. A `LocalBusiness` with no address and no
 * telephone is a claim that a business exists somewhere, which Google reads as
 * incomplete markup and a shopper cannot act on. Measured against production,
 * most supplier rows are exactly that: name and nothing else. Those get no
 * node rather than an empty one, which is the same rule the `Offer` above
 * follows for a coupon that cannot be sold.
 *
 * `@id` is the product URL plus a fragment, so two products of the same
 * supplier do not assert two different businesses, and the supplier's identity
 * is anchored to a URL that resolves.
 */
export function buildLocalBusinessJsonLd(input: LocalBusinessJsonLdInput): JsonLdNode | null {
  const name = input.name.trim()
  const street = input.address?.trim() || null
  const city = input.city?.trim() || null
  const telephone = input.telephone?.trim() || null

  if (!name) return null
  if (!street && !city && !telephone) return null

  const site = trimSite(input.siteUrl)
  const url = absolute(site, input.path)

  const node: JsonLdNode = {
    '@context': SCHEMA,
    '@type': 'LocalBusiness',
    '@id': `${url}#supplier`,
    name,
    url,
  }

  if (street || city) {
    const address: Record<string, unknown> = { '@type': 'PostalAddress', addressCountry: 'IL' }
    if (street) address.streetAddress = street
    if (city) address.addressLocality = city
    node.address = address
  }
  if (telephone) node.telephone = telephone
  if (input.logoUrl) node.image = absolute(site, input.logoUrl)

  return node
}
