import { withRequestLog } from '@/lib/observability/with-request-log'
import { SITEMAP_SECTIONS, sectionPath, sitemapIndexXml } from '@/lib/seo/sitemap-sections'
import { siteUrl } from '@/lib/site-url'
import { NextResponse } from 'next/server'

/**
 * `/sitemap.xml` - the SITEMAP INDEX. It lists the five per-type files and no
 * URLs of its own.
 *
 * WHY IT IS A ROUTE HANDLER AND NOT `app/sitemap.ts`. The metadata convention
 * serialises a `MetadataRoute.Sitemap`, which is a `<urlset>`. There is no
 * shape of that type that produces a `<sitemapindex>`, so an index has to be
 * written. This file IS the old `app/sitemap.ts`, moved rather than replaced:
 * its address is unchanged, `robots.txt` still points here, and anything that
 * has already fetched this URL keeps getting an answer at it. What changed is
 * that the answer is now a table of contents.
 *
 * NO `lastmod` ON THE INDEX ENTRIES, and it is the same argument
 * `newestTimestamp` makes for the files themselves. The honest lastmod of
 * `/sitemap/products.xml` is the newest product in it, and producing that here
 * means running the product query to build the index: three catalogue reads to
 * serve a document with five lines in it, on every crawl of the index. The per
 * file lastmods inside each `<urlset>` carry the same information at the
 * resolution that matters, and an omitted field says "I do not know" rather
 * than something a crawler will learn to ignore.
 *
 * The cache header mirrors `/merchant.xml`: nothing at the browser, an hour at
 * the edge, a day of stale-while-revalidate. A stale index is five URLs that
 * have not moved; a missing one is a submission failure.
 */
async function handleGET(): Promise<NextResponse> {
  const base = siteUrl().replace(/\/+$/, '')

  const xml = sitemapIndexXml(
    SITEMAP_SECTIONS.map((section) => ({ loc: `${base}${sectionPath(section)}` })),
  )

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export const GET = withRequestLog('/sitemap.xml', handleGET)
