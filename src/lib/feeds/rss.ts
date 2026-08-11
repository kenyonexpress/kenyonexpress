import { absoluteUrl } from '@/lib/site-url'
import type { FeedProduct } from './catalogue'
import { cdata, escapeXml, rfc822, tag } from './xml'

/**
 * RSS 2.0 over the newest deals.
 *
 * Pure: takes rows and a clock, returns a string. The route next door does the
 * reading and the caching, which is what lets every rule below be asserted
 * without a database.
 *
 * `atom:link rel="self"` is not decoration. Readers and aggregators use it to
 * canonicalise a feed they were handed under some other URL, and without it the
 * same feed reached through a proxy or a trailing slash is a second feed with
 * every item unread again.
 */

export interface RssOptions {
  siteUrl: string
  title: string
  description: string
  /** Absolute URL of the feed itself. */
  selfUrl: string
  builtAt: Date
}

export function buildRssFeed(products: readonly FeedProduct[], options: RssOptions): string {
  const site = options.siteUrl.replace(/\/+$/, '')

  const items = products.map((product) => {
    const url = `${site}/product/${encodeURIComponent(product.slug)}`
    // Same reason as the Merchant feed: a reader fetches an enclosure from
    // wherever it is subscribed, and a site-relative path resolves against the
    // reader's own origin.
    const image = absoluteUrl(site, product.imageUrl)
    // `guid isPermaLink="true"` says the id IS the URL, which is true here and
    // means a reader that has seen the page will not resurface it. A guid that
    // changed with the price would re-notify every subscriber on every edit.
    return [
      '<item>',
      tag('title', product.name),
      tag('link', url),
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      cdata('description', itemDescription(product)),
      product.publishedAt ? tag('pubDate', rfc822(product.publishedAt)) : '',
      image ? `<enclosure url="${escapeXml(image)}" type="image/jpeg" />` : '',
      '</item>',
    ]
      .filter(Boolean)
      .join('')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    tag('title', options.title),
    tag('link', site),
    tag('description', options.description),
    // Hebrew. `he` is the correct RFC 5646 tag; `iw` is the legacy one Google
    // Wallet still wants, and the two live in different files on purpose.
    tag('language', 'he'),
    tag('lastBuildDate', rfc822(options.builtAt)),
    `<atom:link href="${escapeXml(options.selfUrl)}" rel="self" type="application/rss+xml" />`,
    ...items,
    '</channel>',
    '</rss>',
  ]
    .filter(Boolean)
    .join('')
}

/**
 * What a subscriber sees in a reader, and the reason the price is stated the
 * way the product page states it.
 *
 * A coupon's headline number is what is paid ONLINE, with a balance due at the
 * business. A feed line that said only "₪80" would put a customer at a counter
 * expecting to owe nothing, which is the same mistake `coupon-offer.ts` was
 * written to stop the storefront making.
 */
function itemDescription(product: FeedProduct): string {
  const parts: string[] = []
  if (product.description) parts.push(product.description)

  if (product.offer?.sellable) {
    // One template, never two joined with `+`. [20] measured that the build
    // drops the tail of each operand when template literals are concatenated:
    // the served string was silently missing text, with a 200 and no log.
    const balance =
      product.offer.balanceAtBusinessIls > 0
        ? `, ועוד ${money(product.offer.balanceAtBusinessIls)} בבית העסק`
        : ''
    parts.push(`שלמו ${money(product.offer.paidOnlineIls)} באתר${balance}`)
    if (product.offer.discountPercent > 0) {
      parts.push(
        `חיסכון ${product.offer.discountPercent}% ממחיר מלא של ${money(product.offer.fullPriceIls)}`,
      )
    }
  } else if (product.payableIls !== null) {
    parts.push(money(product.payableIls))
  }

  return parts.join(' · ')
}

function money(value: number): string {
  return `₪${value.toFixed(2)}`
}
