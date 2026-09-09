import { sitemapSectionEntries } from '@/lib/seo/sitemap-data'
import { type SitemapSection, urlsetXml } from '@/lib/seo/sitemap-sections'
import { NextResponse } from 'next/server'

/**
 * One section's `<urlset>`, as a response.
 *
 * The five route files under `app/sitemap/` are six lines each and all of them
 * call this. Written once so that a change to the cache policy, the content
 * type or the serialiser cannot land on four of the five - which is exactly the
 * shape of the bug that left `/city/<region>` out of the sitemap for as long as
 * the lists were maintained by hand.
 */
export async function sitemapSectionResponse(section: SitemapSection): Promise<NextResponse> {
  const xml = urlsetXml(await sitemapSectionEntries(section))

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
