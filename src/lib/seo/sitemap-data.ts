import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { orFail } from '@/lib/catalogue-read'
import { publishedContentPageEntries } from '@/lib/content/read'
import { newestTimestamp } from '@/lib/seo/lastmod'
import {
  type SitemapEntry,
  type SitemapSection,
  categorySitemapEntries,
  contentSitemapEntries,
  productSitemapEntries,
  regionSitemapEntries,
  supplierSitemapEntries,
} from '@/lib/seo/sitemap-sections'
import { siteUrl } from '@/lib/site-url'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * The catalogue reads behind the sitemap. The shaping is in
 * `sitemap-sections.ts`; this file only fetches.
 *
 * WHAT IS DELIBERATELY ABSENT, carried over from the file this replaced.
 * Nothing behind authentication and nothing that is personal or single-use:
 * /account/**, /supplier/**, /admin/**, /checkout, /cart, and above all
 * /redeem/[token] - that path IS a signed voucher token, and publishing one in
 * a sitemap hands a stranger the QR of a coupon somebody paid for. The redeem
 * page also sets robots noindex of its own, so it is refused twice.
 *
 * Reads go through `createPublicClient` (anon), not the service-role admin
 * client. Locally the demo secret key makes admin fail silently and the sitemap
 * collapsed to the three static URLs. Anon is the same catalogue the storefront
 * already caches, and only columns that are already public are selected.
 * Tagged with `CATALOGUE_TAG` so an admin save that calls `updateTag` refreshes
 * these lists too.
 *
 * `use cache` + `cacheLife('hours')` and not `export const revalidate`, which
 * `cacheComponents` does not accept as a route segment config. The profile also
 * buys an `expire` of a day: if Supabase is unreachable, the last good sitemap
 * keeps being served instead of a fresh empty one, and a sitemap that briefly
 * lists nothing is a deindexing request.
 *
 * EVERY READ GOES THROUGH `orFail`, and that is what makes the expire window
 * mean anything. Discarding the error yields `data: null`, the `?? []` turns it
 * into an empty list, and the enclosing `use cache` scope stores THAT as the
 * good answer - so a failure does not fall back to the last good sitemap, it
 * replaces it for the full cache life, silently. `use cache` stores nothing for
 * a scope that threw, which is why failing loudly is the safe direction here.
 */

async function readProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      // Google caps a single sitemap file at 50,000 URLs. Now that products
      // have a file to themselves the cap applies to products alone, which is
      // the whole of the headroom rather than a share of it.
      .limit(45_000),
    'sitemap.products_read_failed',
  )
  return data ?? []
}

async function readCategories() {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)
      .not('slug', 'is', null),
    'sitemap.categories_read_failed',
  )
  return data ?? []
}

async function readSuppliers() {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)
  const supabase = createPublicClient()
  const data = orFail(
    await supabase
      .from('suppliers')
      .select('id, updated_at')
      .eq('status', 'active')
      .is('deleted_at', null),
    'sitemap.suppliers_read_failed',
  )
  return data ?? []
}

/**
 * The lastmod for the three pages whose content IS the catalogue.
 *
 * The clock was what this used, and a lastmod that is always "now" carries no
 * information: every fetch claims the page changed since the last one. Google
 * says as much explicitly - an inaccurate lastmod is ignored, and it is ignored
 * for the WHOLE FILE, not per URL, so dishonest dates on three static entries
 * cost the accurate ones on every product too.
 */
async function catalogueTouched(): Promise<Date | undefined> {
  const [products, categories] = await Promise.all([readProducts(), readCategories()])
  return newestTimestamp([...products, ...categories].map((row) => row.updated_at))
}

/** One section's entries, ready to serialise. */
export async function sitemapSectionEntries(section: SitemapSection): Promise<SitemapEntry[]> {
  const base = siteUrl()

  switch (section) {
    case 'content':
      return contentSitemapEntries(
        base,
        await catalogueTouched(),
        await publishedContentPageEntries(),
      )
    case 'categories':
      return categorySitemapEntries(base, await readCategories())
    case 'products':
      return productSitemapEntries(base, await readProducts())
    case 'regions':
      // No read at all: the seventeen regions are a source constant.
      return regionSitemapEntries(base)
    case 'suppliers':
      return supplierSitemapEntries(base, await readSuppliers())
  }
}
