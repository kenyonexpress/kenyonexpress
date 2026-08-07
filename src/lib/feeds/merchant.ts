import { absoluteUrl } from '@/lib/site-url'
import type { FeedProduct } from './catalogue'
import { cdata, tag } from './xml'

/**
 * Google Merchant Center product feed, RSS 2.0 with the `g:` namespace.
 *
 * THE RULE THAT DECIDES EVERYTHING ELSE: `g:price` must be the number the
 * landing page shows and the checkout charges. Google re-crawls the page and
 * compares; a mismatch is not a warning, it is an item disapproval and, if it
 * is systematic, an account suspension. So the price here comes from
 * `buildCouponOffer` — the same function the product page and the JSON-LD read —
 * and never from `products.price_ils`, which for a coupon is the sticker price
 * of the goods and NOT what anyone is charged online.
 *
 * WHAT IS EXCLUDED, AND WHY EXCLUSION BEATS GUESSING
 *
 *   - No price: a coupon whose `coupon_price_ils` the admin has not set is
 *     `sellable: false`. The product page refuses to quote it; a feed that
 *     invented a number would advertise something no checkout honours.
 *   - No image: `g:image_link` is required, and an item without one is
 *     disapproved on submission. Dropping it locally keeps the disapproval
 *     count at zero rather than moving the same problem into a dashboard.
 *
 * Every exclusion is COUNTED and returned, because a feed that quietly shrinks
 * looks exactly like a catalogue that quietly shrank.
 */

export interface MerchantOptions {
  siteUrl: string
  title: string
  description: string
  builtAt: Date
}

export interface MerchantFeed {
  xml: string
  included: number
  /** Why each excluded product was excluded, so a shrinking feed has a reason. */
  excluded: { slug: string; reason: 'no_price' | 'no_image' }[]
}

export function buildMerchantFeed(
  products: readonly FeedProduct[],
  options: MerchantOptions,
): MerchantFeed {
  const site = options.siteUrl.replace(/\/+$/, '')
  const excluded: MerchantFeed['excluded'] = []
  const items: string[] = []

  for (const product of products) {
    if (product.payableIls === null) {
      excluded.push({ slug: product.slug, reason: 'no_price' })
      continue
    }
    if (!product.imageUrl) {
      excluded.push({ slug: product.slug, reason: 'no_image' })
      continue
    }
    items.push(item(product, site))
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    tag('title', options.title),
    tag('link', site),
    tag('description', options.description),
    ...items,
    '</channel>',
    '</rss>',
  ].join('')

  return { xml, included: items.length, excluded }
}

function item(product: FeedProduct, site: string): string {
  const url = `${site}/product/${encodeURIComponent(product.slug)}`
  const payable = product.payableIls as number

  return [
    '<item>',
    // The slug and not the UUID: it is stable, it is what the URL carries, and
    // Google keeps an item's history against this id. A feed that switched id
    // schemes would look like every product being deleted and re-added.
    tag('g:id', product.slug),
    tag('g:title', product.name),
    cdata('g:description', product.description ?? product.name),
    tag('g:link', url),
    // Absolute, always. Half the active catalogue stores a site-relative path,
    // and Google cannot fetch one: 27 of 46 physical products were disapproved
    // by the first build of this feed.
    tag('g:image_link', absoluteUrl(site, product.imageUrl)),
    tag('g:availability', product.inStock ? 'in_stock' : 'out_of_stock'),
    // `condition` is a Google enum, not free text. An unrecognised value is a
    // disapproval, and everything sold here is new unless a shop says otherwise.
    tag('g:condition', normaliseCondition(product.condition)),
    ...priceTags(product, payable),
    tag('g:brand', product.brand),
    tag('g:gtin', product.gtin),
    tag('g:mpn', product.sku),
    // Required when there is no GTIN and no MPN. Stated explicitly rather than
    // left out, because the default Google assumes is the opposite one.
    tag('g:identifier_exists', product.gtin || product.sku ? 'yes' : 'no'),
    '</item>',
  ]
    .filter(Boolean)
    .join('')
}

/**
 * `g:price` and, when there is a real discount, `g:sale_price`.
 *
 * The pair is emitted only when the sticker price is genuinely HIGHER than what
 * is charged. Sending `price == sale_price` makes Google render a strike-through
 * on a number that never changed, which is a claim about a saving that does not
 * exist.
 */
function priceTags(product: FeedProduct, payable: number): string[] {
  const full = product.fullPriceIls
  if (full !== null && full > payable) {
    return [tag('g:price', amount(full)), tag('g:sale_price', amount(payable))]
  }
  return [tag('g:price', amount(payable))]
}

/** Google wants `<number> <currency>`, in that order, with a space. */
function amount(value: number): string {
  return `${value.toFixed(2)} ILS`
}

const GOOGLE_CONDITIONS = new Set(['new', 'refurbished', 'used'])

function normaliseCondition(value: string | null): string {
  const normalised = value?.trim().toLowerCase() ?? ''
  return GOOGLE_CONDITIONS.has(normalised) ? normalised : 'new'
}
