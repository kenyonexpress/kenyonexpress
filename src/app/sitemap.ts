import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

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
 * The service-role client reads the catalog because a sitemap is generated
 * without a session and must not depend on anonymous RLS happening to expose
 * products. Only columns that are already public are selected.
 */

export const revalidate = 3600

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  return raw.replace(/\/+$/, '')
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/coupons`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
  ]

  const admin = createAdminClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    admin
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      // Google caps a single sitemap file at 50,000 URLs; staying well inside
      // that keeps this one file rather than needing an index.
      .limit(45_000),
    admin.from('categories').select('slug, updated_at').not('slug', 'is', null),
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
