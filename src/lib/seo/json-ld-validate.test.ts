import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import {
  buildBlogJsonLd,
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildItemListJsonLd,
  buildProductJsonLd,
  buildSiteJsonLd,
  jsonLdScript,
} from '@/lib/seo/json-ld'
import { jsonLdErrors, validateJsonLd, validateJsonLdText } from '@/lib/seo/json-ld-validate.mjs'
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

const unsellableCoupon: CouponOffer = {
  sellable: false,
  reason: 'expired',
  fullPriceIls: 200,
  validUntil: new Date('2026-01-01T00:00:00.000Z'),
}

const post = {
  slug: 'how-coupons-work',
  title: 'איך עובד קופון בקניון אקספרס',
  description: 'מה קורה מרגע התשלום ועד הסריקה.',
  publishedAt: '2026-08-10',
}

function errorsOf(node: unknown): string[] {
  return jsonLdErrors(validateJsonLd(node)).map((issue) => `${issue.path}: ${issue.message}`)
}

/**
 * Every builder in `json-ld.ts`, validated as built. If one of these starts
 * failing, a page is shipping a node Google would drop, and the builder is
 * what to fix rather than the test.
 */
describe('every builder produces valid structured data', () => {
  it('Product with a physical offer', () => {
    expect(errorsOf(buildProductJsonLd(physical))).toEqual([])
  })

  it('Product never carries an AggregateRating: ratings are owner-only (STEP 45)', () => {
    expect(buildProductJsonLd(physical)).not.toHaveProperty('aggregateRating')
    expect(buildProductJsonLd(physical)).not.toHaveProperty('review')
  })

  it('Product with a sellable coupon offer', () => {
    const node = buildProductJsonLd({ ...physical, priceIls: null, couponOffer: sellableCoupon })
    expect(errorsOf(node)).toEqual([])
  })

  it('Product with an unsellable coupon (availability, no price)', () => {
    const node = buildProductJsonLd({ ...physical, priceIls: null, couponOffer: unsellableCoupon })
    expect(errorsOf(node)).toEqual([])
  })

  it('Product with no offer is an error, which is the honest answer', () => {
    // A physical product with no price has nothing a rich result can show.
    // The page still renders; the node is what a crawler would discard.
    const node = buildProductJsonLd({ ...physical, priceIls: null })
    expect(errorsOf(node)).toEqual([
      '$.offers: Product needs at least one of offers, aggregateRating or review',
    ])
  })

  it('Product without images is a warning, not an error', () => {
    const issues = validateJsonLd(buildProductJsonLd({ ...physical, images: [] }))
    expect(jsonLdErrors(issues)).toEqual([])
    expect(issues.map((i) => i.path)).toContain('$.image')
  })

  it('BreadcrumbList', () => {
    const node = buildBreadcrumbJsonLd(
      [
        { name: 'בית', path: '/' },
        { name: 'ספא', path: '/category/spa' },
        { name: 'עיסוי', path: '/product/massage' },
      ],
      SITE,
    )
    expect(errorsOf(node)).toEqual([])
  })

  it('ItemList', () => {
    const node = buildItemListJsonLd({
      name: 'ספא',
      path: '/category/spa',
      entries: [
        { name: 'א', path: '/product/a' },
        { name: 'ב', path: '/product/b' },
      ],
      startPosition: 25,
      siteUrl: SITE,
    })
    expect(errorsOf(node)).toEqual([])
  })

  it('Organization and WebSite with the sitelinks search box', () => {
    expect(errorsOf(buildSiteJsonLd(SITE))).toEqual([])
  })

  it('FAQPage', () => {
    const node = buildFaqJsonLd([
      { question: 'איך זה עובד?', answer: 'משלמים חלק באתר.' },
      { question: 'מה התוקף?', answer: 'מוצג לפני הרכישה.' },
    ])
    expect(errorsOf(node)).toEqual([])
  })

  it('BlogPosting, with an author so the card is not a warning', () => {
    const issues = validateJsonLd(buildBlogPostingJsonLd(post, SITE))
    expect(jsonLdErrors(issues)).toEqual([])
    expect(issues.map((i) => i.path)).not.toContain('$.author')
  })

  it('Blog with its posts nested without a second @context', () => {
    const node = buildBlogJsonLd([post], SITE)
    expect(errorsOf(node)).toEqual([])
    const nested = (node.blogPost as Record<string, unknown>[])[0] ?? {}
    expect(nested).not.toHaveProperty('@context')
    expect(nested['@type']).toBe('BlogPosting')
  })

  it('round-trips through jsonLdScript', () => {
    const text = jsonLdScript(buildProductJsonLd(physical))
    const { nodes, issues } = validateJsonLdText(text)
    expect(nodes).toHaveLength(1)
    expect(jsonLdErrors(issues)).toEqual([])
  })
})

describe('validateJsonLd catches the ways structured data goes wrong', () => {
  const product = () => buildProductJsonLd(physical) as Record<string, unknown>

  it('rejects a missing @context at the top level', () => {
    const { '@context': _ctx, ...node } = product()
    expect(errorsOf(node)).toContain('$.@context: must be "https://schema.org"')
  })

  it('rejects a node without a @type', () => {
    expect(errorsOf({ '@context': 'https://schema.org', name: 'x' })).toEqual([
      '$.@type: every node needs a @type string',
    ])
  })

  it('rejects undefined and empty-string leaves', () => {
    const node = { ...product(), description: undefined, sku: '' }
    const errors = errorsOf(node)
    expect(errors).toContain('$.description: is null or undefined; omit the key instead')
    expect(errors).toContain('$.sku: is an empty string; omit the key instead')
  })

  it('rejects a relative URL where an absolute one is required', () => {
    const node = { ...product(), url: '/product/airpods-pro-2' }
    expect(errorsOf(node)[0]).toMatch(/^\$\.url: must be an absolute http\(s\) URL/)
  })

  it('rejects a price without a currency', () => {
    const node = product()
    const offers = { ...(node.offers as Record<string, unknown>) }
    offers.priceCurrency = undefined
    expect(errorsOf({ ...node, offers })).toContain(
      '$.offers.priceCurrency: ISO 4217 code required when price is set',
    )
  })

  it('rejects an availability that is not a schema.org URL', () => {
    const node = product()
    const offers = { ...(node.offers as Record<string, unknown>), availability: 'InStock' }
    expect(errorsOf({ ...node, offers })[0]).toMatch(/^\$\.offers\.availability: must be/)
  })

  it('rejects a highPrice below the price', () => {
    const node = product()
    const offers = { ...(node.offers as Record<string, unknown>), highPrice: '1.00' }
    expect(errorsOf({ ...node, offers })).toContain('$.offers.highPrice: must not be below price')
  })

  it('rejects a rating over zero reviews', () => {
    const node = {
      ...product(),
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 5, reviewCount: 0 },
    }
    expect(errorsOf(node)).toContain(
      '$.aggregateRating.reviewCount: a rating over zero reviews is a fabricated claim',
    )
  })

  it('rejects breadcrumb positions with a hole', () => {
    const node = buildBreadcrumbJsonLd(
      [
        { name: 'בית', path: '/' },
        { name: 'ספא', path: '/category/spa' },
      ],
      SITE,
    )
    const items = node.itemListElement.map((item, i) => ({ ...item, position: i === 1 ? 3 : 1 }))
    expect(errorsOf({ ...node, itemListElement: items })).toContain(
      '$.itemListElement: positions must be consecutive and ascending',
    )
  })

  it('rejects an empty breadcrumb', () => {
    const node = { ...buildBreadcrumbJsonLd([], SITE) }
    expect(errorsOf(node)).toContain('$.itemListElement: needs at least one ListItem')
  })

  it('rejects an ItemList whose numberOfItems lies', () => {
    const node = buildItemListJsonLd({
      name: 'x',
      path: '/category/x',
      entries: [{ name: 'a', path: '/product/a' }],
      siteUrl: SITE,
    }) as Record<string, unknown>
    expect(errorsOf({ ...node, numberOfItems: 7 })).toContain(
      '$.numberOfItems: does not match the number of elements',
    )
  })

  it('rejects a SearchAction whose query-input names a different placeholder', () => {
    const website = (buildSiteJsonLd(SITE) as Record<string, unknown>[])[1] ?? {}
    const action = { ...(website.potentialAction as Record<string, unknown>) }
    action['query-input'] = 'required name=q'
    expect(errorsOf({ ...website, potentialAction: action })[0]).toMatch(
      /^\$\.potentialAction\.query-input: must name the placeholder search_term_string/,
    )
  })

  it('rejects a Question without an Answer', () => {
    const node = buildFaqJsonLd([{ question: 'q', answer: 'a' }]) as Record<string, unknown>
    const mainEntity = [{ '@type': 'Question', name: 'q' }]
    expect(errorsOf({ ...node, mainEntity })).toContain(
      '$.mainEntity[0].acceptedAnswer: needs an Answer with text',
    )
  })

  it('rejects a BlogPosting whose dateModified precedes datePublished', () => {
    const node = buildBlogPostingJsonLd({ ...post, updatedAt: '2026-01-01' }, SITE)
    expect(errorsOf(node)).toContain('$.dateModified: is before datePublished')
  })

  it('rejects a date that is not ISO 8601', () => {
    const node = buildBlogPostingJsonLd({ ...post, publishedAt: '10/08/2026' }, SITE)
    expect(errorsOf(node)[0]).toMatch(/^\$\.datePublished: must be an ISO 8601 date/)
  })

  it('reports unparseable JSON as one error rather than throwing', () => {
    const { nodes, issues } = validateJsonLdText('{not json')
    expect(nodes).toEqual([])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/^not valid JSON/)
  })

  it('validates an array of top-level nodes with indexed paths', () => {
    const nodes = buildSiteJsonLd(SITE) as Record<string, unknown>[]
    const broken = [nodes[0], { ...nodes[1], url: 'kenyonexpress.co.il' }]
    expect(errorsOf(broken)).toEqual([
      '$[1].url: must be an absolute http(s) URL, got "kenyonexpress.co.il"',
      '$[1].url: needs an absolute URL',
    ])
  })
})
