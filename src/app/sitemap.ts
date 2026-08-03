import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
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

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  return raw.replace(/\/+$/, '')
}

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

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/coupons`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
  ]

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

  return [...staticEntries, ...categoryEntries, ...productEntries]
}
