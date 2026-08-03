import withBundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { REMOTE_IMAGE_PATTERNS } from './src/lib/images/remote-hosts'
import { PAYMENT_FRAME_PATHS, contentSecurityPolicyFor } from './src/lib/security/frame-policy'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

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
  cacheComponents: true,
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
  async redirects() {
    return [
      // Printed QR cards and older docs name /scan; the live screen is under
      // the supplier portal. Keep the short path as a permanent alias.
      { source: '/scan', destination: '/supplier/scan', permanent: true },
    ]
  },
  turbopack: {
    root: __dirname,
    /**
     * Next packs Array.at / flat / Object.hasOwn polyfills into every client
     * visit even though its own browser baseline already has them. Lighthouse
     * mobile bills ~13KiB as legacy-javascript on the home chunk ([32]). Point
     * the module at an empty file so modern phones skip the dead weight.
     */
    resolveAlias: {
      '../build/polyfills/polyfill-module': './src/lib/modern-polyfill.js',
      'next/dist/build/polyfills/polyfill-module': './src/lib/modern-polyfill.js',
    },
  },
  images: {
    // 50/60 for below-fold deal thumbs ([33]); Lighthouse image-delivery wanted
    // denser compression on 157px paints that were still shipping q=75.
    qualities: [50, 60, 75, 90, 95],
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
    /**
     * Built from `src/lib/images/remote-hosts.ts`, which is also what the admin
     * forms validate against. Two copies of this list is how a URL gets stored
     * that next/image will throw on, and a throw here is a 500 on a
     * customer-facing page rather than a broken image.
     */
    remotePatterns: [...REMOTE_IMAGE_PATTERNS],
  },
  compiler: {
    /**
     * Sentry's own tree-shaking flags, delivered by the bundler that actually
     * runs here.
     *
     * `withSentryConfig({ webpack: { treeshake: ... } })` implements every one
     * of these as a `webpack.DefinePlugin` (@sentry/nextjs/build/cjs/config/
     * webpack.js:553). This project builds with Turbopack, which never loads
     * that plugin, so the option below the fold was inert: measured at
     * 1801237 bytes of client JS with it on and 1801237 with it off. Same
     * finding as the `bundleSizeOptimizations` flags tried in [21].
     *
     * `compiler.define` is the bundler-native equivalent, and it does reach
     * node_modules. Measured on the same build, total client JS:
     *
     *   nothing set                  1802668   (largest chunk 436747)
     *   __SENTRY_DEBUG__ alone       1797197   (largest chunk 434316)
     *   + __SENTRY_TRACING__         1743875   (largest chunk 381140)
     *
     * The three `__RRWEB_*` / replay-worker flags were measured too and moved
     * ZERO bytes, because no replay integration is imported anywhere; they are
     * left out rather than kept as decoration.
     *
     * `__SENTRY_TRACING__: false` is safe because tracing is off by decision in
     * all three runtimes: `tracesSampleRate: 0` in instrumentation-client.ts,
     * sentry.server.config.ts and sentry.edge.config.ts. Turn any of those up
     * and this flag has to come out first, or the spans are shaken out of the
     * build and the sample rate silently governs nothing.
     */
    define: {
      __SENTRY_DEBUG__: false,
      __SENTRY_TRACING__: false,
    },
  },
  experimental: {
    /**
     * `inlineCss: true` was tried here for the 870ms of render-blocking CSS and
     * REVERTED on measurement. It does what it says - the render-blocking audit
     * goes to zero and FCP drops 1.7s -> 1.15s - but this site's CSS is not the
     * compact atomic bundle the trade-off assumes. The document went from
     * 267631 to 542125 bytes (34132 -> 89668 gzipped) because the styles are
     * emitted twice, once in <style> and once in the RSC payload, and every
     * store route is `no-store`, so that lands on every navigation. Measured
     * over 3 mobile runs: score 85/85/80 -> 84/82/80, TTFB 360-460ms ->
     * 1140-4930ms, Speed Index 1.7s -> 2.2-7.5s. Net negative.
     *
     * What did work for the same audit is upstream of the bundler: the three
     * small route stylesheets moved into the root layout, so the browser makes
     * one CSS request instead of four. See src/app/layout.tsx.
     */
    serverActions: {
      bodySizeLimit: '10mb',
    },
    /**
     * lucide-react is a barrel. Without this, SiteHeader/SiteFooter pull the
     * whole icon set into the client graph for a handful of icons ([25]).
     */
    optimizePackageImports: ['lucide-react'],
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

  webpack: {
    // `treeshake.removeDebugLogging` used to sit here, and it never removed a
    // byte: it is a webpack DefinePlugin and this project builds with
    // Turbopack. It now lives in `compiler.define` above, where it was measured
    // doing the work. Left here it would have gone on reading like a budget
    // that was already being enforced.
    //
    // Vercel's cron and uptime pings would otherwise be reported as transactions.
    automaticVercelMonitors: false,
  },
})
