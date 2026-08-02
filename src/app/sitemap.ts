import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

/**
 * Sitemap over indexable pages: static entry points, categories, active products.
 *
 * Deliberately absent: /account/**, /supplier/**, /admin/**, /checkout, /cart,
 * /coupon/[id], /redeem/[token] (signed vouchers must never be listed).
 *
 * ISR: at most once per hour (ARCHITECTURE-SEO-PERFORMANCE §1.1).
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
