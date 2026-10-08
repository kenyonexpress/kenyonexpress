import createMDX from '@next/mdx'
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { REMOTE_IMAGE_PATTERNS } from './src/lib/images/remote-hosts'
import {
  ASSET_CONTENT_SECURITY_POLICY,
  ASSET_HEADER_SOURCE,
  CAMERA_PATHS,
  PAYMENT_FRAME_PATHS,
  PROXY_SKIPPED_PATHS,
  cspReportUriFromEnv,
  permissionsPolicyFor,
  reportingEndpointsHeader,
} from './src/lib/security/frame-policy'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/*
 * `@next/bundle-analyzer` used to be built here and then never applied to the
 * exported config, so `pnpm analyze` produced no report and said nothing about
 * it. Applying it would not have helped: the package installs a webpack
 * BundleAnalyzerPlugin, and on a TURBOPACK build it returns the config
 * untouched (@next/bundle-analyzer/index.js:8). This project builds with
 * Turbopack, same class of inert option as the Sentry `webpack.treeshake`
 * flags found in [21].
 *
 * The analyzer that does run here is the CLI's own: `next experimental-analyze`,
 * which is Turbopack-only. That is what `pnpm analyze` now calls.
 */

// Security headers applied to every route. See INFRA-AUDIT.md section 2 and
// src/lib/security/frame-policy.ts, where every value below is decided.
//
// THE CONTENT-SECURITY-POLICY IS NOT HERE, EXCEPT FOR ASSETS. A static header
// cannot carry a per-request nonce, so the document policy is minted in
// src/proxy.ts on every request (STEP 30). This file emits a policy on exactly
// the paths the proxy's matcher skips (_next/static, _next/image, the favicon,
// image files), and on nothing else: Next appends the headers of every entry
// whose source matches, two Content-Security-Policy headers are BOTH enforced,
// and the stricter would silently undo the nonce. ASSET_HEADER_SOURCE and the
// default entry's lookahead are built from the same PROXY_SKIPPED_PATHS string
// the proxy's matcher is a literal copy of; frame-policy.test.ts pins the copy.
//
// The rest is path-dependent in two places and static everywhere else: the
// Cardcom return stub is framable by this origin (X-Frame-Options SAMEORIGIN),
// and the QR scanners may open the camera (Permissions-Policy). Those two
// exceptions are the reason the entries below are split the way they are.
//
// `Reporting-Endpoints` names the Sentry security endpoint the proxy's policy
// reports to. It is read from env at build time here and at runtime on the
// edge; `cspReportUriFromEnv` is the one reader, so the two cannot disagree.
const REPORTING_ENDPOINTS = reportingEndpointsHeader(cspReportUriFromEnv(process.env))

const securityHeaders = (
  frameOptions: 'DENY' | 'SAMEORIGIN',
  permissions: string,
  contentSecurityPolicy?: string,
) => [
  ...(contentSecurityPolicy
    ? [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }]
    : []),
  ...(REPORTING_ENDPOINTS ? [{ key: 'Reporting-Endpoints', value: REPORTING_ENDPOINTS }] : []),
  // Two years, subdomains, preload-list eligible. Changing this is a
  // registrar-level decision, not a config edit: a preloaded domain cannot
  // be served over plain HTTP again within the lifetime of the entry.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Moves in step with frame-ancestors. Browsers that honour both enforce both,
  // so a DENY left behind on a framable path blocks the frame anyway.
  { key: 'X-Frame-Options', value: frameOptions },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Origin only, on every navigation and fetch this site makes, including
  // same-origin ones. The one reader of a same-origin path, the consent
  // action, was moved to a request header the proxy sets
  // (lib/security/request-path.ts) so that this could be `strict-origin`.
  { key: 'Referrer-Policy', value: 'strict-origin' },
  // Path-dependent for the same reason as X-Frame-Options: camera=() on a
  // scanner route is a scanner that cannot see (frame-policy.ts, CAMERA_PATHS).
  { key: 'Permissions-Policy', value: permissions },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  /**
   * `.mdx` joins the page extensions so blog posts can be files rather than
   * database rows.
   *
   * `md` is deliberately NOT included. This repo already carries dozens of
   * `.md` files at the root and under `docs/`; adding the extension makes Next
   * scan for them as route candidates, and the only thing standing between
   * `docs/ARCHITECTURE-OPS.md` and a public URL would be that it happens to sit
   * outside `src/app`. One extension, one purpose.
   */
  pageExtensions: ['ts', 'tsx', 'mdx'],
  async headers() {
    // NON-OVERLAPPING sources, which is the whole trick. Next appends the
    // headers of every entry whose source matches, so two entries that both
    // matched /checkout/frame-return would emit two X-Frame-Options headers,
    // and two that both matched a .svg would emit two Content-Security-Policy
    // headers, of which browsers enforce the intersection. The negative
    // lookahead makes the default entry skip exactly the paths the others
    // claim: the framable stub, the scanner routes, and the assets.
    const framable = PAYMENT_FRAME_PATHS.map((path) => path.replace(/^\//, '')).join('|')
    // Anchored so `scan` does not swallow a future /scanner-esque route.
    const cameraSources = CAMERA_PATHS.map((path) => `${path.replace(/^\//, '')}(?:$|/)`).join('|')
    return [
      {
        source: `/((?!${PROXY_SKIPPED_PATHS}|${framable}|${cameraSources}).*)`,
        headers: securityHeaders('DENY', permissionsPolicyFor('/')),
      },
      {
        // The paths src/proxy.ts never sees, so the one place a policy for
        // them can come from. script-src 'none': nothing here is a document,
        // except an SVG opened as one.
        source: ASSET_HEADER_SOURCE,
        headers: securityHeaders('DENY', permissionsPolicyFor('/'), ASSET_CONTENT_SECURITY_POLICY),
      },
      ...PAYMENT_FRAME_PATHS.map((path) => ({
        source: `${path}/:path*`,
        headers: securityHeaders('SAMEORIGIN', permissionsPolicyFor(path)),
      })),
      ...CAMERA_PATHS.map((path) => ({
        source: `${path}{/:path}?`,
        headers: securityHeaders('DENY', permissionsPolicyFor(path)),
      })),
      ...PAYMENT_FRAME_PATHS.map((path) => ({
        source: path,
        headers: securityHeaders('SAMEORIGIN', permissionsPolicyFor(path)),
      })),
    ]
  },
  async redirects() {
    return [
      // Printed QR cards and older docs name /scan; the live screen is under
      // the supplier portal. Keep the short path as a permanent alias.
      { source: '/scan', destination: '/supplier/scan', permanent: true },
      // The cancellation policy is asked for at /cancellation-policy, and it
      // lives at /refund_returns. A redirect rather than a second page: the
      // WordPress URL is what existing links, the footer and any indexed search
      // result point at, and two routes rendering one policy is how they drift
      // until the site states two different cancellation terms. 308 keeps the
      // canonical on /refund_returns.
      { source: '/cancellation-policy', destination: '/refund_returns', permanent: true },
      // The English spellings the goal and the docs use, for the same reason.
      { source: '/terms', destination: '/terms-and-conditions', permanent: true },
      { source: '/privacy', destination: '/privacy-policy', permanent: true },
      { source: '/returns', destination: '/refund_returns', permanent: true },
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
     * AVIF first, WebP for the browsers that cannot decode it
     * (ARCHITECTURE-PERFORMANCE-SEO.md 4.2). Next 16's default is WebP only.
     * The order is the preference order when the Accept header allows both;
     * an animated or SVG source is passed through unchanged regardless, so the
     * catalogue's photos are the only things this touches. Both formats are
     * cached separately by Vercel Image Optimization, which is storage, not
     * transformations, and transformations are what the plan bills.
     */
    formats: ['image/avif', 'image/webp'],
    /**
     * 31 days at the edge for an optimized image (2678400 = 31 * 24 * 3600).
     *
     * Next 16 raised its own default from 60s to 4 hours, and 4 hours is still
     * six re-optimizations a day per (source, width, quality, format) tuple
     * that nobody asked for: a product photo here changes by changing its PATH
     * (4.2 rule 5, and `media_assets` keys on the path), so the bytes behind a
     * given URL never change and a long TTL forfeits nothing. It also caps the
     * upstream reads Supabase Storage sees for the same photo.
     */
    minimumCacheTTL: 2678400,
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
    /**
     * One loader for every image on the site, and it is Next's own loader
     * with one addition: with NEXT_PUBLIC_R2_IMAGES=1 a stored
     * `/images/products/*` or `/images/cdn/*` path is fetched by the
     * optimizer from the signed R2 proxy (src/app/images/r2) instead of from
     * public/. Byte-equal to the default for everything else; the test next
     * to the file pins that, because a loader is in the path of every
     * product photo and a drift here is a drift on every page.
     */
    loader: 'custom',
    loaderFile: './src/lib/images/loader.ts',
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
     * `__SENTRY_TRACING__` IS NO LONGER SET, and its removal is the load-bearing
     * half of turning tracing on.
     *
     * It used to be `false`, which was correct while `tracesSampleRate` was 0
     * in all three runtimes. The three configs now sample at 0.1, and the note
     * that used to sit here spelled out the trap this avoids:
     *
     *   "Turn any of those up and this flag has to come out first, or the spans
     *    are shaken out of the build and the sample rate silently governs
     *    nothing."
     *
     * That is exactly what it does. The flag is a bundler-level constant, so
     * `false` deletes the span code at build time; the SDK then reads 0.1,
     * reports no error, and emits no transaction. A config that looks enabled
     * and is not.
     *
     * The removal is not free, and the number is the one already measured on
     * this build: __SENTRY_TRACING__ was worth 53322 bytes of client JS
     * (1797197 -> 1743875 with it on). Tracing costs that back. It is charged
     * on the client bundle only; `__SENTRY_DEBUG__: false` stays, and it was
     * independently worth 5471 bytes.
     */
    define: {
      __SENTRY_DEBUG__: false,
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
 * step; it does not touch `headers()`, so the security headers above (and
 * the policy in src/lib/security/frame-policy.ts) are unaffected. The order still matters:
 * wrapping the other way round would hand Sentry a config next-intl had not
 * finished building.
 */
/**
 * MDX with no remark or rehype plugins.
 *
 * Every plugin here is another thing that runs over content at build time, and
 * the posts this serves are written in-house: there is no untrusted markdown to
 * sanitise and no frontmatter to parse, because each post exports its own typed
 * metadata. Plugins can be added when a post needs one, not in advance.
 */
const withMDX = createMDX({})

export default withSentryConfig(withMDX(withNextIntl(nextConfig)), {
  // THE SLUGS ARE IN THE CODE BECAUSE THE UPLOAD NEVER RAN WITHOUT THEM.
  //
  // Measured on the production build of 2026-10-05 (`vercel inspect --logs`):
  // "No org provided. Will not upload source maps." Vercel Production holds
  // SENTRY_AUTH_TOKEN and both DSNs but neither SENTRY_ORG nor SENTRY_PROJECT,
  // so every deploy since the project was wired shipped an auth token to a
  // plugin with nowhere to send the maps, and every production stack trace
  // stayed minified. Neither slug is a secret (both are in the dashboard URL
  // and in docs/SENTRY-SETUP.md), so they default here and the variables stay
  // as overrides for a fork pointed at its own project.
  org: process.env.SENTRY_ORG ?? 'kenyonexpress',
  project: process.env.SENTRY_PROJECT ?? 'kenyonexpress-web',
  // EU org. Against the default `https://sentry.io` the org does not resolve
  // and the upload 404s in a way that reads like a bad token (SENTRY-SETUP.md).
  sentryUrl: process.env.SENTRY_URL ?? 'https://de.sentry.io',
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // THE RELEASE THE MAPS ARE FILED UNDER IS THE RELEASE THE RUNTIMES REPORT.
  //
  // Stated as the same expression sentry.server.config.ts and
  // sentry.edge.config.ts use, rather than left to the plugin's own git
  // detection: on Vercel both resolve to the commit sha, but a CI build sets
  // SENTRY_RELEASE to `github.sha` and the plugin, left to itself, would read
  // the checkout's HEAD, which on a pull_request event is the merge commit
  // and not the sha the runtime reports. Maps filed under a release no event
  // names are never applied. `undefined` (a laptop) hands the plugin its own
  // detection back, which is the previous behaviour.
  release: { name: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA },

  // A failed upload is a warning, never a failed deploy. Without this the
  // plugin throws and a revoked token or a Sentry outage takes the shop down
  // with it; the same posture every other observability leg here takes.
  // Measured 2026-10-06: the Production token answers 401 to `releases new`
  // and `sourcemaps upload`, and the deploy still has to go out.
  errorHandler(error) {
    console.warn(`[sentry] source-map upload skipped: ${error.message}`)
  },

  // Absent auth token means no upload attempt at all, so a local build and a
  // fork's CI both work with no credential rather than failing at the last step.
  silent: !process.env.CI,

  // Uploaded and then DELETED from the deployed output. A .map served publicly
  // hands anyone the unminified source of the checkout, including every
  // client-side guard and every route name.
  //
  // The deletion also hides the thing most worth checking. Locally there is no
  // SENTRY_AUTH_TOKEN, so the upload is a no-op while the delete still runs,
  // and `.next/static` ends up with zero .map files either way: whether the
  // maps were generated and removed, or never generated at all, looks
  // identical. Those are very different states - the second one means the
  // Vercel build uploads nothing and every production stack trace stays
  // minified - so SENTRY_KEEP_SOURCEMAPS=1 keeps them in place and makes the
  // difference visible. Build-time only, never set on a deploy.
  sourcemaps: { deleteSourcemapsAfterUpload: process.env.SENTRY_KEEP_SOURCEMAPS !== '1' },

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
