// Relative, not `@/`: `next.config.ts` imports this module directly, and the
// config is loaded before the tsconfig path aliases are in play.
import { REMOTE_IMAGE_PATTERNS } from '../images/remote-hosts'
import { SHELL_INLINE_SCRIPT_HASHES } from './shell-script-hashes.mjs'

// The security policy of every response, in one place.
//
// Two decisions live here. The framing one (which path may be framed, by whom)
// is the older of the two and explained first; the script one (which script
// may run) came with STEP 30 and is explained under "THE SCRIPT POLICY".
//
// THE PROBLEM THE FRAMING EXCEPTION SOLVES
//
// Cardcom's Low Profile page is rendered inside an iframe on our checkout, so
// the shopper never leaves the site to pay. `frame-src` already allows that:
// we are the parent, Cardcom is the child. What breaks is the step after it.
// When the payment finishes, Cardcom navigates THAT IFRAME to the redirect URL
// we gave it, which is one of our own pages. At that instant our page is the
// framed one, and `frame-ancestors 'none'` plus `X-Frame-Options: DENY` are a
// blank frame and a payment whose outcome the shopper never sees.
//
// WHY EXACTLY ONE PATH, AND WHY IT IS NOT THE CONFIRMATION PAGE
//
// The obvious move is to relax framing on /checkout/return. It does not work,
// for a reason that has nothing to do with CSP: the navigation from Cardcom
// into our iframe is a CROSS-SITE SUBRESOURCE navigation, and browsers withhold
// `SameSite=Lax` cookies on those. The Supabase session cookie is Lax. So the
// confirmation page would load without a session, the proxy would bounce it to
// /login, and the shopper would watch a login form appear inside the payment
// box after paying.
//
// So the framed page is a stub that needs no session at all. It carries an
// order id, renders nothing, and moves the TOP window to /checkout/return. That
// second navigation is top-level, Lax cookies ride along, and the real
// confirmation page runs authenticated and unframed exactly as before: it
// keeps `frame-ancestors 'none'` and it keeps requiring a session.
//
// WHY 'self' IS SAFE HERE AND 'none' IS STILL RIGHT EVERYWHERE ELSE
//
// frame-ancestors 'none' exists to stop clickjacking: an attacker frames our
// page under their own chrome and harvests clicks. `'self'` does not permit
// that: a cross-origin attacker still cannot frame these two paths, because
// they are not us. It permits precisely one thing: our own origin framing them,
// which is the case we need. Every other route in the app keeps 'none'.

/**
 * The only path that may be framed, and only by this origin. It is the stub
 * Cardcom returns into; it holds no session, renders no order, and exists to
 * hand the top window a URL.
 */
export const PAYMENT_FRAME_PATHS = ['/checkout/frame-return'] as const

export function isPaymentFramePath(pathname: string): boolean {
  return PAYMENT_FRAME_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/**
 * `img-src`, DERIVED from the one image-host allowlist instead of restated.
 *
 * It used to be a hand-written list of three hosts beside a six-host
 * `REMOTE_IMAGE_PATTERNS`, and the three that were missing included
 * `picsum.photos`, which is exactly the [18] finding, where 45 catalogue rows
 * pointed at a host the CSP did not allow and three pages rendered BROKEN
 * IMAGES with nothing but a console violation to show for it. Two lists of
 * hosts that must agree, maintained separately, is that bug waiting to be
 * written again; `next.config.ts` already builds `remotePatterns` from the same
 * array, so this is the third reader and the last hand-copied one.
 *
 * This LOOSENS the header, and that is the right trade here. `img-src` already
 * carries `data:` and `blob:`, which are broader than any host list: an
 * injected script that wanted to exfiltrate through an image has both. What the
 * named hosts change is not what an attacker can reach, it is whether a legit
 * image renders, and a blocked image on a catalogue page is silent.
 */
const IMG_SRC_SOURCES = [
  "'self'",
  'data:',
  'blob:',
  ...REMOTE_IMAGE_PATTERNS.map((pattern) => `${pattern.protocol}://${pattern.hostname}`),
]

// THE SCRIPT POLICY, MEASURED 2026-10-07
//
// `script-src` carries a per-request nonce and NO 'unsafe-inline'. Getting
// there on a site that prerenders every page took three measurements, and the
// shape of the directive is the shape of what was measured:
//
//   1. The static shell `next build` writes for a page is served from the
//      cache on every request, and it holds 19 `<script src>` bootstrap tags
//      and two constant inline scripts (the consent pre-paint snippet and
//      React's `$RT` timing probe). None can carry a nonce: no request exists
//      when they are written. So `'self'` stays, for the bootstrap tags, and
//      the two constants are allowed by hash (`shell-script-hashes.mjs`).
//      `'strict-dynamic'` is therefore NOT emitted: it makes browsers ignore
//      `'self'`, which blocks those 19 tags and leaves a page that never
//      hydrates. The spec asked for it; the shell makes it a dead page.
//
//   2. Everything else inline (React's flight data, `$RC`/`$RX`, next/script)
//      is written at request time by the resume render, and Next stamps the
//      nonce on all of it when the REQUEST carries a `Content-Security-Policy`
//      header naming one. Measured on `/`, `/login`, `/checkout/frame-return`:
//      every resume-time script nonced, nothing else inline. The proxy sets
//      that request header, and `components/security/PerRequestScripts.tsx`
//      keeps every route on the resume path so there is no page whose flight
//      data is baked into the shell without a nonce.
//
//   3. 'unsafe-inline' cannot stay as a fallback: a browser that understands
//      nonces ignores it the moment a nonce or hash is present (CSP3), so it
//      would protect nothing and only hide the gap from the report stream.
//
// Scripts from vendors (GA4, the Meta Pixel, PostHog's recorder) are host
// sources, added only when the vendor is configured (`vendorSources`). Their
// inline bootstraps go through next/script with the nonce prop.
//
// `style-src` keeps 'unsafe-inline'. React writes `style=""` attributes
// throughout the tree and the UI libraries inject `<style>` at runtime; a
// nonce there is a measurement that has not been made, and an injected style
// is a defacement, not code execution. Stated, not hidden.
//
// CSP violations are reported to Sentry when a DSN is configured
// (`report-uri` for the browsers that still speak it, `report-to` for the
// ones that moved on), so a blocked script is an event with a `blocked-uri`
// and a `script-sample`, not a silent console line.

/** The request header the proxy mints the nonce into; Next's convention. */
export const NONCE_HEADER = 'x-nonce'

/**
 * 128 random bits, base64. Web Crypto only: the proxy runs on the edge runtime,
 * where `node:crypto` does not exist, and Node exposes the same global.
 * Base64's alphabet is inside what Next's nonce parser accepts
 * (`[A-Za-z0-9+/_-]+={0,2}`), which is what lets it stamp the scripts.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * The paths the proxy does not run on, so the nonce policy never reaches
 * them and `next.config.ts` emits the asset policy there instead. This string
 * is the body of the proxy's `matcher` lookahead; `frame-policy.test.ts`
 * reads `src/proxy.ts` and fails if the two differ, because Next requires the
 * matcher to be a literal and will not take it from an import.
 */
export const PROXY_SKIPPED_PATHS =
  '_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$'

/**
 * The same set as a header `source` for `next.config.ts`: the two prefixes,
 * the favicon, and any path ending in an image extension.
 */
export const ASSET_HEADER_SOURCE =
  '/((?:_next/static|_next/image|favicon\\.ico).*|.*\\.(?:svg|png|jpg|jpeg|gif|webp))'

/** The analytics vendors a policy may have to admit, read from env by `vendorSources`. */
export type VendorSources = {
  script: string[]
  connect: string[]
  img: string[]
  frame: string[]
}

const NO_VENDORS: VendorSources = { script: [], connect: [], img: [], frame: [] }

/**
 * Host sources for the third parties this app can load, each present ONLY
 * when its id is configured. The ids are read the way `readThirdPartyConfig`
 * and `lib/observability/posthog.ts` read them, so a vendor the page would
 * mount is a vendor the policy admits, and one it would not is not listed.
 *
 * Why env-gated rather than always on: a host in `script-src` is a host an
 * injected script may load code from. GA4 and the Pixel are only ever mounted
 * after consent (`ThirdPartyTags`), and a deployment without a GA id has no
 * reason to trust googletagmanager.com at all.
 */
export function vendorSources(env: Record<string, string | undefined>): VendorSources {
  const sources: VendorSources = { script: [], connect: [], img: [], frame: [] }
  if (env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim()) {
    sources.script.push('https://www.googletagmanager.com')
    sources.connect.push(
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
    )
    sources.img.push('https://*.google-analytics.com', 'https://www.googletagmanager.com')
  }
  if (env.NEXT_PUBLIC_META_PIXEL_ID?.trim()) {
    sources.script.push('https://connect.facebook.net')
    sources.connect.push('https://www.facebook.com')
    sources.img.push('https://www.facebook.com')
  }
  if (env.NEXT_PUBLIC_POSTHOG_KEY?.trim()) {
    const host = posthogOrigin(env.NEXT_PUBLIC_POSTHOG_HOST)
    if (host) {
      // Events go to the ingest host (`lib/observability/posthog.ts`); the
      // session recorder is a script the SDK loads from the matching assets
      // host (`us.i.posthog.com` -> `us-assets.i.posthog.com`).
      sources.connect.push(host.origin)
      const assets = host.hostname.replace(/^([a-z]+)\.i\./, '$1-assets.i.')
      sources.script.push(`https://${assets}`)
    }
  }
  return sources
}

function posthogOrigin(value: string | undefined): URL | null {
  try {
    return new URL(value?.trim() || 'https://us.i.posthog.com')
  } catch {
    return null
  }
}

export type ContentSecurityPolicyOptions = {
  /**
   * The per-request nonce. Required for a document; `contentSecurityPolicyFor`
   * is for documents, `ASSET_CONTENT_SECURITY_POLICY` for everything else.
   */
  nonce: string
  /** Where violation reports go. Null or absent means no reporting directive. */
  reportUri?: string | null
  /** Vendor hosts, from `vendorSources(process.env)`. Absent means none. */
  vendors?: VendorSources
}

function join(directive: string, sources: readonly string[]): string {
  return `${directive} ${sources.join(' ')}`
}

/** The directives that carry no nonce and no vendor, in emission order. */
function fixedDirectives(vendors: VendorSources): string[] {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    join('img-src', [...IMG_SRC_SOURCES, ...vendors.img]),
    "font-src 'self'",
    join('connect-src', ["'self'", 'https://*.supabase.co', ...vendors.connect]),
    // Cardcom's payment page on /checkout, and OpenStreetMap's embed for the
    // merchant map on /coupon/[slug] (`lib/geo/merchant-map.ts` is the one
    // builder of that src, and its test pins the origin to this line).
    join('frame-src', [
      'https://secure.cardcom.solutions',
      'https://www.openstreetmap.org',
      ...vendors.frame,
    ]),
    // The service worker (`public/sw.js`). Named rather than left to fall
    // back through child-src to script-src: a worker request is checked as a
    // fetch, not as a parser-inserted script, and the fallback chain is the
    // kind of thing that changes between browser versions.
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://secure.cardcom.solutions",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ]
}

function frameAncestorsFor(pathname: string): string {
  return isPaymentFramePath(pathname) ? "frame-ancestors 'self'" : "frame-ancestors 'none'"
}

function reportingDirectives(reportUri: string | null | undefined): string[] {
  return reportUri ? [`report-uri ${reportUri}`, `report-to ${CSP_REPORT_GROUP}`] : []
}

/**
 * The policy of an HTML document at `pathname`, carrying the request's nonce.
 * `frame-ancestors` is the one directive that depends on the path, and it is
 * emitted exactly once: appended twice, the strictest wins and the Cardcom
 * exception is silently undone.
 */
export function contentSecurityPolicyFor(
  pathname: string,
  options: ContentSecurityPolicyOptions,
): string {
  const vendors = options.vendors ?? NO_VENDORS
  const scriptSrc = join('script-src', [
    "'self'",
    `'nonce-${options.nonce}'`,
    ...SHELL_INLINE_SCRIPT_HASHES.map((hash) => `'${hash}'`),
    ...vendors.script,
  ])
  return [
    ...fixedDirectives(vendors).slice(0, 1),
    scriptSrc,
    ...fixedDirectives(vendors).slice(1),
    frameAncestorsFor(pathname),
    ...reportingDirectives(options.reportUri),
  ].join('; ')
}

/**
 * The policy of everything the proxy skips: `_next/static`, `_next/image`,
 * the favicon and any image file. None of it is a document that runs script,
 * except an SVG opened as one, which is exactly why `script-src` is `'none'`
 * here rather than a nonce nobody would stamp. Emitted by `next.config.ts`
 * on `ASSET_HEADER_SOURCE`.
 */
export const ASSET_CONTENT_SECURITY_POLICY = [
  ...fixedDirectives(NO_VENDORS).slice(0, 1),
  "script-src 'none'",
  ...fixedDirectives(NO_VENDORS).slice(1),
  "frame-ancestors 'none'",
].join('; ')

export const CSP_REPORT_GROUP = 'csp-endpoint'

/**
 * Sentry's security-report endpoint, derived from a DSN. The DSN is
 * `https://<public key>@<host>/<project id>`; the endpoint is
 * `https://<host>/api/<project id>/security/?sentry_key=<public key>`.
 * Anything that does not parse to that shape yields null and no directive,
 * which is the right answer for a laptop with no DSN.
 */
export function sentrySecurityEndpoint(
  dsn: string | null | undefined,
  environment?: string | null,
): string | null {
  if (!dsn) return null
  let parsed: URL
  try {
    parsed = new URL(dsn)
  } catch {
    return null
  }
  const key = parsed.username
  const project = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!key || !/^\d+$/.test(project)) return null
  const endpoint = new URL(`${parsed.protocol}//${parsed.host}/api/${project}/security/`)
  endpoint.searchParams.set('sentry_key', key)
  if (environment) endpoint.searchParams.set('sentry_environment', environment)
  return endpoint.toString()
}

/**
 * The report endpoint as the proxy and the config both read it off env, so
 * the two cannot name different Sentry projects. The DSN is a build-time
 * value in the config and a runtime one on the edge; on Vercel both see the
 * project's environment, on a laptop usually neither, and then there is no
 * reporting directive.
 */
export function cspReportUriFromEnv(env: Record<string, string | undefined>): string | null {
  return sentrySecurityEndpoint(
    env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN,
    env.SENTRY_ENVIRONMENT || env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || env.VERCEL_ENV,
  )
}

/**
 * The `Reporting-Endpoints` header `report-to` refers to. Emitted beside the
 * policy by next.config.ts; a `report-to` group with no endpoint header is
 * silently ignored, which is why the two are built from the same value.
 */
export function reportingEndpointsHeader(reportUri: string | null | undefined): string | null {
  return reportUri ? `${CSP_REPORT_GROUP}="${reportUri}"` : null
}

/**
 * X-Frame-Options has to move in step with frame-ancestors. It is the older,
 * coarser control, and browsers that honour both enforce both: leaving DENY on
 * a path whose CSP says 'self' would block the frame anyway and make the CSP
 * exception look broken rather than absent.
 */
export function frameOptionsFor(pathname: string): 'DENY' | 'SAMEORIGIN' {
  return isPaymentFramePath(pathname) ? 'SAMEORIGIN' : 'DENY'
}

/**
 * The routes that legitimately open the device camera: the supplier QR
 * scanner (both its addresses, `app/(supplier)/scan/ScanClient.tsx`) and the
 * merchant scanner (`app/merchant/scan/MerchantScanClient.tsx`, STEP 14).
 * Everywhere else camera stays denied. Permissions-Policy: camera=() on a
 * route a scanner lives on is a scanner that silently cannot see, which is
 * exactly what the static header was doing until 2026-09-02, and what it kept
 * doing to the merchant scanner until STEP 30 read the code for this list.
 */
export const CAMERA_PATHS = ['/scan', '/supplier/scan', '/merchant/scan'] as const

export function isCameraPath(pathname: string): boolean {
  return CAMERA_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/**
 * Every feature this app does not use, denied outright; the three it uses,
 * `self` only. Minimal means "what the code calls", read from the code:
 *
 *   camera        the two QR scanners, on CAMERA_PATHS only.
 *   geolocation   `components/geo/CityTags` ("near me") on the home page and
 *                 category pages. `geolocation=()` was the header until STEP
 *                 30 and it silently refused every such click: the same
 *                 finding as the camera, on a different feature.
 *   payment       kept at `self` as before; the Cardcom frame is cross-origin
 *                 and gets nothing from it either way.
 *
 * Not listed, deliberately: `publickey-credentials-get` (passkeys sign in
 * here) and `web-share` (the share buttons), whose defaults are already
 * `self`. `fullscreen`, `clipboard-write` and `autoplay` are left at their
 * defaults because the policy strings are not uniform across browsers and a
 * refused clipboard copy on a share button is a worse outcome than the one
 * the denial prevents.
 */
export function permissionsPolicyFor(pathname: string): string {
  const camera = isCameraPath(pathname) ? 'camera=(self)' : 'camera=()'
  return [
    camera,
    'geolocation=(self)',
    'payment=(self)',
    'microphone=()',
    'accelerometer=()',
    'gyroscope=()',
    'magnetometer=()',
    'midi=()',
    'usb=()',
    'serial=()',
    'bluetooth=()',
    'hid=()',
    'display-capture=()',
    'screen-wake-lock=()',
    'xr-spatial-tracking=()',
    'browsing-topics=()',
    'interest-cohort=()',
  ].join(', ')
}
