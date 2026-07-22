import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Security headers applied to every route. See INFRA-AUDIT.md §2.
// CSP note: a per-request nonce + strict-dynamic cannot live in a static config
// header; it requires generating a nonce in src/proxy.ts. Until that lands, script
// and style fall back to 'unsafe-inline'. next/font self-hosts Heebo, so no Google
// Fonts origin is needed. Allowed externals: Supabase (data/realtime/images),
// Unsplash (images), Cardcom (payment redirect target).
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
  // Pin the workspace root to this app directory. Without this, Next.js walks up
  // and may infer the parent folder as the root when multiple lockfiles exist,
  // emitting a "inferred your workspace root" warning. pnpm-lock.yaml lives here.
  turbopack: {
    root: __dirname,
  },
  images: {
    qualities: [75, 90, 95],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
    ],
  },
}

export default withNextIntl(nextConfig)
