import { sortedPosts } from '@/content/blog'
import { LEGAL_PAGE_SLUGS, getLegalPage } from '@/content/legal'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
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

  // Both reads go through `orFail`, and that is the whole point of the expire
  // window described above. Discarding the `error` here inverted the promise
  // this file makes two comments up: a failed query yields `data: null`, the
  // `?? []` below turns it into an empty list, and the enclosing `use cache`
  // scope stores THAT as the good answer - so the failure did not fall back to
  // the last good sitemap, it replaced it for the full cache life, silently.
  // A sitemap that lists nothing is a deindexing request, which is why this
  // read failing loudly is the safe direction: `use cache` stores nothing for a
  // scope that threw, so the previous sitemap keeps being served.
  //
  // This file kept the bug through both 2026-08-20 fixes because the record of
  // the second one assumed `getFeedProducts` fed it. It does not - that backs
  // feed.xml and merchant.xml, and these two reads are the sitemap's own.
  const [productsRead, categoriesRead] = await Promise.all([
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

  const products = orFail(productsRead, 'sitemap.products_read_failed')
  const categories = orFail(categoriesRead, 'sitemap.categories_read_failed')

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
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    // Higher than the other content pages because it is the page a business
    // lands on, and a business is worth more than a session.
    { url: `${base}/suppliers`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/blog`, changeFrequency: 'weekly', priority: 0.6 },
    // Each post carries a real `publishedAt`, so unlike `/contact` there IS a
    // date worth publishing. Driven off the same registry the index renders, so
    // a post cannot be listed in one and missing from the other.
    ...sortedPosts().map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt ?? post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
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
