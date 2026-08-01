import { withSentryConfig } from '@sentry/nextjs'
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
    /**
     * Next's default, plus one rung at 288.
     *
     * The gap between 256 and 384 is where this site's two densest grids land.
     * A homepage deal card paints 157px on a 412px phone, which at dpr 1.75
     * needs 277 device pixels: 256 is too small, so every one of the 32 cards
     * gets a 384 - 39% more pixels than it renders, and Lighthouse mobile puts
     * the bill at 400KiB on that page alone. 288 covers 277 exactly.
     *
     * This is global, so it adds one candidate to the srcset of every image
     * whose `sizes` reaches this part of the ramp. That is the intent: the rung
     * is only ever chosen by a box that actually wants it, and a box that wants
     * 384 still gets 384.
     */
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 288, 384],
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

/**
 * Sentry wraps LAST, outside next-intl.
 *
 * withSentryConfig only adds webpack/turbopack plugins and a source-map upload
 * step; it does not touch `headers()`, so the CSP work above (and in
 * src/lib/security/frame-policy.ts) is unaffected. The order still matters:
 * wrapping the other way round would hand Sentry a config next-intl had not
 * finished building.
 */
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Absent auth token means no upload attempt at all, so a local build and a
  // fork's CI both work with no credential rather than failing at the last step.
  silent: !process.env.CI,

  // Uploaded and then DELETED from the deployed output. A .map served publicly
  // hands anyone the unminified source of the checkout, including every
  // client-side guard and every route name.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Routes the browser SDK's own requests through our origin, so an ad blocker
  // (which most Israeli shoppers run) cannot silently drop error reports. The
  // cost is that this path must stay out of the proxy's auth matcher.
  tunnelRoute: '/monitoring',

  // Both of these moved under `webpack` in @sentry/nextjs 10, and the branch
  // was written against the older flat names. Left as they were, the build
  // printed two DEPRECATION WARNINGs per run and the options would stop being
  // read on the next major without anything failing — the quiet kind of
  // regression, where the debug logger returns to the client bundle and nobody
  // notices until a performance budget does.
  webpack: {
    // The tree-shaken debug logger is a meaningful chunk of the client bundle,
    // and the performance budgets in ARCHITECTURE-SEO-SITEMAP are already tight.
    treeshake: { removeDebugLogging: true },

    // Vercel's cron and uptime pings would otherwise be reported as transactions.
    automaticVercelMonitors: false,
  },
})
