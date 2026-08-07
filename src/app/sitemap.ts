import { LEGAL_PAGE_SLUGS, getLegalPage } from '@/content/legal'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { newestTimestamp } from '@/lib/seo/lastmod'
import { siteUrl } from '@/lib/site-url'
import { createPublicClient } from '@/lib/supabase/anon'
import type { MetadataRoute } from 'next'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Sitemap over the pages that are worth indexing: the static entry points, the
 * category archives, and every active product.
 *
 * WHAT IS DELIBERATELY ABSENT. Nothing behind authentication and nothing that
 * is personal or single-use: /account/**, /supplier/**, /admin/**, /checkout,
 * /cart, and above all /redeem/[token] - that path IS a signed voucher token,
 * and publishing one in a sitemap hands a stranger the QR of a coupon somebody
 * paid for. The redeem page also sets robots noindex of its own, so it is
 * refused twice.
 *
 * Reads go through `createPublicClient` (anon), not the service-role admin
 * client. Locally the demo secret key makes admin fail silently and the
 * sitemap collapsed to the three static URLs ([15]/[27]). Anon is the same
 * catalogue the storefront already caches, and only columns that are already
 * public are selected. Tagged with `CATALOGUE_TAG` so an admin save that
 * calls `updateTag` refreshes this list too.
 */

/**
 * `use cache` + `cacheLife('hours')` replaces `export const revalidate = 3600`,
 * which `cacheComponents` does not accept as a route segment config. Same hour,
 * expressed where the caching happens rather than as a property of the file.
 *
 * The profile also buys an `expire` of a day: if the catalogue read fails or
 * this is not requested for a while, the last good sitemap keeps being served
 * instead of a fresh empty one. A sitemap that briefly lists nothing is a
 * deindexing request.
 *
 * `new Date()` is legal inside a cached scope; outside one, under this flag, it
 * is an error - see src/components/CopyrightYear.tsx.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const base = siteUrl()
  const now = new Date()

  const supabase = createPublicClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      // Google caps a single sitemap file at 50,000 URLs; staying well inside
      // that keeps this one file rather than needing an index.
      .limit(45_000),
    supabase
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)
      .not('slug', 'is', null),
  ])

  const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map((c) => ({
    url: `${base}/category/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: `${base}/product/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // The listing pages change when the CATALOGUE changes, so their lastmod is
  // the newest thing on them — not `new Date()`.
  //
  // The clock was what this used, and a lastmod that is always "now" is a
  // lastmod that carries no information: every fetch of the sitemap claims all
  // four pages changed since the last one, so a crawler either re-fetches
  // pages that did not move or, having learned the value is noise, stops
  // reading it. Google says as much explicitly — an inaccurate lastmod is
  // ignored, and it is ignored for the whole file, not per URL.
  const catalogueTouched = newestTimestamp(
    [...(products ?? []), ...(categories ?? [])].map((row) => row.updated_at),
  )

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: catalogueTouched, changeFrequency: 'daily', priority: 1 },
    {
      url: `${base}/products`,
      lastModified: catalogueTouched,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${base}/coupons`,
      lastModified: catalogueTouched,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    // No lastModified at all. `/contact` changes when the code changes, and
    // there is no signal here for that; omitting it says "I do not know", which
    // is both true and better than a date that is wrong every time.
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/faq`, changeFrequency: 'monthly', priority: 0.5 },
    // The legal pages DO carry a date, because they have one: `updatedAt` is a
    // field of the document, so unlike `/contact` there is a real signal to
    // publish. They are also the four addresses the old site already has
    // indexed, which is why they are listed rather than left to be found.
    ...LEGAL_PAGE_SLUGS.map((slug) => ({
      url: `${base}/${slug}`,
      lastModified: new Date(getLegalPage(slug).updatedAt),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]

  return [...staticEntries, ...categoryEntries, ...productEntries]
}
