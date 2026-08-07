import { getFeedProducts } from '@/lib/feeds/catalogue'
import { buildMerchantFeed } from '@/lib/feeds/merchant'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { siteUrl } from '@/lib/site-url'
import { NextResponse } from 'next/server'

/**
 * `/merchant.xml` — the Google Merchant Center product feed.
 *
 * Not linked from anywhere and not in `robots.txt`: it is fetched by a
 * scheduled pull configured in Merchant Center, which is given this URL
 * directly. It is public because Merchant's fetcher does not authenticate, and
 * it publishes nothing the product pages do not.
 *
 * The exclusion counts are LOGGED on every build. A Merchant feed that quietly
 * shrinks is indistinguishable from a catalogue that shrank, and the one signal
 * that separates them — how many products were dropped and why — exists only
 * here, at the moment the file is built.
 */
async function handleGET(): Promise<NextResponse> {
  const site = siteUrl()
  // Above the sitemap's 45k cap on purpose: Merchant takes far fewer items than
  // a sitemap does, and this catalogue is two orders of magnitude below either.
  const products = await getFeedProducts(5_000)

  const feed = buildMerchantFeed(products, {
    siteUrl: site,
    title: 'KenyonExpress',
    description: 'קטלוג המוצרים של קניון אקספרס',
    builtAt: new Date(0),
  })

  if (feed.excluded.length > 0) {
    log.warn('feed.merchant_items_excluded', {
      included: feed.included,
      excluded: feed.excluded.length,
      no_price: feed.excluded.filter((e) => e.reason === 'no_price').length,
      no_image: feed.excluded.filter((e) => e.reason === 'no_image').length,
      // Named, not just counted. "Eleven products are missing" is a report with
      // nothing to act on; eleven slugs is an afternoon's data work.
      slugs: feed.excluded.slice(0, 50).map((e) => e.slug),
    })
  }

  return new NextResponse(feed.xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export const GET = withRequestLog('/merchant.xml', handleGET)
