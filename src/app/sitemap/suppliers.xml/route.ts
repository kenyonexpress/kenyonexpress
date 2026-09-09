import { withRequestLog } from '@/lib/observability/with-request-log'
import { sitemapSectionResponse } from '@/lib/seo/sitemap-response'

/** One of the five files `/sitemap.xml` indexes. See `sitemap-sections.ts`. */
export const GET = withRequestLog('/sitemap/suppliers.xml', () =>
  sitemapSectionResponse('suppliers'),
)
