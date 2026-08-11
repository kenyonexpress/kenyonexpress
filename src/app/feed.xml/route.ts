import { getFeedProducts } from '@/lib/feeds/catalogue'
import { buildRssFeed } from '@/lib/feeds/rss'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { siteUrl } from '@/lib/site-url'
import { NextResponse } from 'next/server'

/**
 * `/feed.xml` — the newest deals, for readers and aggregators.
 *
 * 50 items. An RSS reader shows a subscriber everything it has not seen, so a
 * first fetch of 200 is 200 unread items on day one; 50 is a few weeks of this
 * catalogue and still more than any reader displays at once.
 *
 * The cache lives in `getFeedProducts` (`use cache` + `CATALOGUE_TAG`), not in
 * a header written here, so an admin save invalidates the feed through the same
 * tag as the sitemap and the storefront.
 */
async function handleGET(): Promise<NextResponse> {
  const site = siteUrl()
  const products = await getFeedProducts(50)

  const xml = buildRssFeed(products, {
    siteUrl: site,
    title: 'KenyonExpress — דילים חדשים',
    description: 'הדילים והקופונים החדשים ביותר בקניון אקספרס',
    selfUrl: `${site}/feed.xml`,
    // The newest item's own timestamp, not the clock. `lastBuildDate` is what
    // a reader polls against, and a value that moves on every request tells it
    // the feed changed every time it asked.
    builtAt: products[0]?.publishedAt ?? products[0]?.updatedAt ?? new Date(0),
  })

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export const GET = withRequestLog('/feed.xml', handleGET)
