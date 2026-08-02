import withBundleAnalyzer from '@next/bundle-analyzer'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { REMOTE_IMAGE_PATTERNS } from './src/lib/images/remote-hosts'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

// Security headers applied to every route. See INFRA-AUDIT.md §2.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://plus.unsplash.com",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co",
  'frame-src https://secure.cardcom.solutions',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://secure.cardcom.solutions",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  async redirects() {
    return [
      // Printed QR cards and older docs name /scan; the live screen is under
      // the supplier portal. Keep the short path as a permanent alias.
      { source: '/scan', destination: '/supplier/scan', permanent: true },
    ]
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    qualities: [75, 90, 95],
    // 288 is the deal-card paint width at common mobile DPR (Lighthouse LCP).
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 288, 384],
    remotePatterns: [...REMOTE_IMAGE_PATTERNS],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default withAnalyzer(withNextIntl(nextConfig))
