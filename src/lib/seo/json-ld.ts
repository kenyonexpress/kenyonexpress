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
  /**
   * `products.brand`, the maker's name an admin typed, when there is one.
   * Wins over the supplier for the Brand node: a shop that sells Samsung is
   * the seller, not the brand. Null on the whole live catalogue today, which
   * is why the supplier fallback below still carries every page.
   */
  brandName?: string | null
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

  // The maker when it is named, else the business selling it: that is the
  // brand a customer recognises. Falling back to the platform name would tell
  // search engines every product is our own.
  const brandName = input.brandName?.trim() || input.supplierName
  if (brandName) {
    node.brand = { '@type': 'Brand', name: brandName }
  }

  const offer = buildOfferNode(input, url)
  if (offer) node.offers = offer

  // No AggregateRating, ever. Ratings are collected from buyers and read by
  // the owner only (STEP 45); a rating claim in structured data that the page
  // itself does not show would tell search engines something visitors cannot
  // see, and the validator in json-ld-validate.ts still rejects the
  // zero-count shape should anyone add the node back by hand.

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

export interface ItemListEntry {
  name: string
  /** Site-relative path, e.g. `/product/x`. */
  path: string
}

export interface ItemListJsonLdInput {
  /** The archive's own name: the category's Hebrew title. */
  name: string
  /** Site-relative path of the page carrying the list, e.g. `/category/spa`. */
  path: string
  /** The products in the order the page shows them. */
  entries: readonly ItemListEntry[]
  /**
   * Position of the first entry across the whole archive. Page 2 of a 24-a-page
   * archive starts at 25, so two pages of one category never both claim to
   * hold items 1-24.
   */
  startPosition?: number
  /** Origin with no trailing slash. */
  siteUrl: string
}

/**
 * `ItemList` for a category archive: the cards on THIS page, numbered from
 * where the page starts in the archive.
 *
 * Only `name` and `url` per entry, on purpose. A price or availability here
 * would be a second copy of the claim the product page's own `Product` node
 * already makes, and two copies drift. Google's carousel guidance reads the
 * linked product page for the rest, so the list is a table of contents and
 * nothing more.
 *
 * Empty in, `null` out: an ItemList with zero elements is a structured-data
 * warning, not an empty page, and the empty state already says so in words.
 */
export function buildItemListJsonLd(input: ItemListJsonLdInput): JsonLdNode | null {
  if (input.entries.length === 0) return null
  const site = trimSite(input.siteUrl)
  const start = Math.max(1, Math.floor(input.startPosition ?? 1))
  return {
    '@context': SCHEMA,
    '@type': 'ItemList',
    name: input.name,
    url: absolute(site, input.path),
    numberOfItems: input.entries.length,
    itemListOrder: `${SCHEMA}/ItemListOrderAscending`,
    itemListElement: input.entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: start + index,
      name: entry.name,
      url: absolute(site, entry.path),
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

export interface FaqEntryLike {
  question: string
  answer: string
}

/**
 * `FAQPage`, from the same array the page renders.
 *
 * Moved here from `/faq` so the validator in `json-ld-validate.mjs` sees the
 * node a test can build, not one that only exists inside a server component.
 */
export function buildFaqJsonLd(entries: readonly FaqEntryLike[]): JsonLdNode {
  return {
    '@context': SCHEMA,
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

export interface BlogPostLike {
  slug: string
  title: string
  description: string
  /** ISO date. */
  publishedAt: string
  updatedAt?: string
}

const PUBLISHER_NAME = 'KenyonExpress'

/**
 * `BlogPosting` for one post. The publisher is the site; the author is the
 * site too, because the posts are house-written and unsigned, and an Article
 * with no author at all is a warning in Google's parser.
 */
export function buildBlogPostingJsonLd(post: BlogPostLike, siteUrl: string): JsonLdNode {
  const site = trimSite(siteUrl)
  const url = `${site}/blog/${encodeURIComponent(post.slug)}`
  return {
    '@context': SCHEMA,
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    url,
    inLanguage: 'he-IL',
    author: { '@type': 'Organization', name: PUBLISHER_NAME, url: site },
    publisher: {
      '@type': 'Organization',
      name: PUBLISHER_NAME,
      url: site,
      logo: { '@type': 'ImageObject', url: `${site}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

/** `Blog` for the index: the posts in the order the page lists them. */
export function buildBlogJsonLd(posts: readonly BlogPostLike[], siteUrl: string): JsonLdNode {
  const site = trimSite(siteUrl)
  return {
    '@context': SCHEMA,
    '@type': 'Blog',
    name: 'הבלוג של קניון אקספרס',
    url: `${site}/blog`,
    inLanguage: 'he-IL',
    publisher: { '@type': 'Organization', name: PUBLISHER_NAME, url: site },
    blogPost: posts.map((post) => {
      // The index entry is the same node minus `@context`: one top-level
      // context is the whole document's, and a nested one is a parser warning.
      const { '@context': _context, ...node } = buildBlogPostingJsonLd(post, site)
      return node
    }),
  }
}

export interface ContactJsonLdInput {
  siteUrl: string
  email: string
  /** International digits (972...) or null when no number is configured. */
  phoneIntl: string | null
  /** `OpeningHoursSpecification` nodes, from `lib/support-hours`. */
  hoursAvailable: readonly Record<string, unknown>[]
}

/**
 * `ContactPage` plus the `Organization` with a customer-service
 * `ContactPoint` for `/contact` (STEP 52).
 *
 * The phone is written E.164 (`+972...`) because that is the form the
 * knowledge panel dials; the page prints the local form for the reader, and
 * both come from the same `lib/whatsapp` number so they cannot disagree. The
 * hours are the same table the page prints, through `lib/support-hours`.
 */
export function buildContactJsonLd(input: ContactJsonLdInput): JsonLdNode[] {
  const site = trimSite(input.siteUrl)
  const contactPoint: Record<string, unknown> = {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: input.email,
    availableLanguage: ['he'],
    areaServed: 'IL',
  }
  if (input.phoneIntl) contactPoint.telephone = `+${input.phoneIntl}`
  if (input.hoursAvailable.length > 0) contactPoint.hoursAvailable = [...input.hoursAvailable]
  return [
    {
      '@context': SCHEMA,
      '@type': 'ContactPage',
      name: 'צור קשר',
      url: `${site}/contact`,
      inLanguage: 'he-IL',
    },
    {
      '@context': SCHEMA,
      '@type': 'Organization',
      name: 'KenyonExpress',
      url: site,
      logo: `${site}/logo.png`,
      contactPoint: [contactPoint],
    },
  ]
}

export interface AboutJsonLdInput {
  siteUrl: string
  email: string
  /** International digits (972...) or null when no number is configured. */
  phoneIntl: string | null
  /** The people `content/about` names, in order. */
  team: readonly { name: string; role: string }[]
}

/**
 * `AboutPage` plus the `Organization` with its founder and a customer-service
 * `ContactPoint` for `/about` (STEP 53).
 *
 * The founder is the first team entry from `content/about`, so the page and
 * the knowledge panel name the same person; the contact point repeats the
 * `/contact` shape with the same email and number, so the two pages cannot
 * describe two different businesses. No `foundingDate`: none is recorded.
 */
export function buildAboutJsonLd(input: AboutJsonLdInput): JsonLdNode[] {
  const site = trimSite(input.siteUrl)
  const contactPoint: Record<string, unknown> = {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: input.email,
    availableLanguage: ['he'],
    areaServed: 'IL',
  }
  if (input.phoneIntl) contactPoint.telephone = `+${input.phoneIntl}`
  const organization: JsonLdNode = {
    '@context': SCHEMA,
    '@type': 'Organization',
    name: 'KenyonExpress',
    url: site,
    logo: `${site}/logo.png`,
    contactPoint: [contactPoint],
  }
  const founder = input.team[0]
  if (founder) {
    organization.founder = { '@type': 'Person', name: founder.name, jobTitle: founder.role }
  }
  return [
    {
      '@context': SCHEMA,
      '@type': 'AboutPage',
      name: 'אודות קניון אקספרס',
      url: `${site}/about`,
      inLanguage: 'he-IL',
      about: { '@type': 'Organization', name: 'KenyonExpress', url: site },
    },
    organization,
  ]
}
