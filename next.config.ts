import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { PAYMENT_FRAME_PATHS, contentSecurityPolicyFor } from './src/lib/security/frame-policy'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Security headers applied to every route. See INFRA-AUDIT.md section 2.
//
// CSP note: a per-request nonce + strict-dynamic cannot live in a static config
// header; it requires generating a nonce in src/proxy.ts. Until that lands, script
// and style fall back to 'unsafe-inline'. next/font self-hosts Heebo, so no Google
// Fonts origin is needed. Allowed externals: Supabase (data/realtime/images),
// Unsplash (images), Cardcom (the iframe the payment page renders in).
//
// The policy itself lives in src/lib/security/frame-policy.ts because ONE of its
// directives depends on the path: the two routes a Cardcom payment returns
// through have to be framable by this origin, and everything else must not be.
// A static header cannot see the path, so it emits the strict default here and
// src/proxy.ts overwrites both framing headers on those two routes. Overwrites,
// not adds: two Content-Security-Policy headers are both enforced and the
// strictest wins, which would undo the exception without saying so.
const headersWithPolicy = (csp: string, frameOptions: 'DENY' | 'SAMEORIGIN') => [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Moves in step with frame-ancestors. Browsers that honour both enforce both,
  // so a DENY left behind on a framable path blocks the frame anyway.
  { key: 'X-Frame-Options', value: frameOptions },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
]

const nextConfig: NextConfig = {
  async headers() {
    // Two NON-OVERLAPPING sources, which is the whole trick. Next appends the
    // headers of every entry whose source matches, so two entries that both
    // matched /checkout/frame-return would emit two Content-Security-Policy
    // headers; browsers enforce the intersection, the stricter frame-ancestors
    // would win, and the exception would be undone with nothing to see in the
    // response. The negative lookahead makes the default entry skip exactly the
    // paths the second one claims.
    //
    // This is also why the relaxation is not done in src/proxy.ts: headers from
    // this config are applied after middleware and overwrite what it set.
    const framable = PAYMENT_FRAME_PATHS.map((path) => path.replace(/^\//, '')).join('|')
    return [
      {
        source: `/((?!${framable}).*)`,
        headers: headersWithPolicy(contentSecurityPolicyFor('/'), 'DENY'),
      },
      ...PAYMENT_FRAME_PATHS.map((path) => ({
        source: `${path}/:path*`,
        headers: headersWithPolicy(contentSecurityPolicyFor(path), 'SAMEORIGIN'),
      })),
      ...PAYMENT_FRAME_PATHS.map((path) => ({
        source: path,
        headers: headersWithPolicy(contentSecurityPolicyFor(path), 'SAMEORIGIN'),
      })),
    ]
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
      // Seed/demo product images (024_seed_demo_products). Without this host in
      // the allowlist, next/image throws and every demo product page 500s.
      { protocol: 'https', hostname: 'picsum.photos' },
      // R2 public CDN (image pipeline renditions)
      { protocol: 'https', hostname: '*.kenyonexpress.co.il' },
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
  },
  experimental: {
    serverActions: {
      // The image pipeline posts original files (up to 8MB) to a server action
      // for sharp processing before upload to R2/Supabase.
      bodySizeLimit: '10mb',
    },
  },
}

export default withNextIntl(nextConfig)
