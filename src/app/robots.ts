import type { MetadataRoute } from 'next'

/**
 * The disallow list is the security-relevant half of this file, not the SEO
 * half.
 *
 * `/redeem/` is first for a reason: that path IS a signed voucher token. A
 * crawler that fetches one is fetching somebody's coupon, and an indexed one is
 * a coupon in a search result. The page also sets robots noindex itself and
 * requires a supplier session, so this is the outermost of three layers rather
 * than the only one.
 *
 * robots.txt is a request, not an access control. Everything listed here is
 * also gated server-side; this only stops well-behaved crawlers from spending
 * their budget on pages that are useless or private.
 */

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  return raw.replace(/\/+$/, '')
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/redeem/', // signed voucher tokens
          '/account/',
          '/supplier/',
          '/admin/',
          '/checkout',
          '/cart',
          '/auth/',
          '/api/',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
