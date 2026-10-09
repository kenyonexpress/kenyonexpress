// Relative, not `@/`: `next.config.ts` imports this module directly, and the
// config is loaded before the tsconfig path aliases are in play.
import { REMOTE_IMAGE_PATTERNS } from '../images/remote-hosts'

// The two framing decisions this site makes, in one place.
//
// THE PROBLEM THIS SOLVES
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
// confirmation page runs authenticated and unframed exactly as before — it
// keeps `frame-ancestors 'none'` and it keeps requiring a session.
//
// WHY 'self' IS SAFE HERE AND 'none' IS STILL RIGHT EVERYWHERE ELSE
//
// frame-ancestors 'none' exists to stop clickjacking: an attacker frames our
// page under their own chrome and harvests clicks. `'self'` does not permit
// that — a cross-origin attacker still cannot frame these two paths, because
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
 * `picsum.photos` — which is exactly the [18] finding, where 45 catalogue rows
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
 * image renders — and a blocked image on a catalogue page is silent.
 */
const IMG_SRC = [
  "img-src 'self' data: blob:",
  ...REMOTE_IMAGE_PATTERNS.map((pattern) => `${pattern.protocol}://${pattern.hostname}`),
].join(' ')

/**
 * The CSP directives that never vary. `frame-ancestors` is deliberately absent:
 * it is the one directive that depends on the path, and appending it here as
 * well would produce it twice, where the strictest wins and the exception is
 * silently undone.
 */
const BASE_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  IMG_SRC,
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co",
  'frame-src https://secure.cardcom.solutions',
  "base-uri 'self'",
  "form-action 'self' https://secure.cardcom.solutions",
  "object-src 'none'",
  'upgrade-insecure-requests',
] as const

/**
 * WHY THERE IS NO NONCE, MEASURED 2026-09-17
 *
 * `script-src` still carries `'unsafe-inline'`, and the reason is no longer
 * "nobody has written the proxy code". Next applies a nonce during
 * server-side rendering of the request that carries it, so a page has to be
 * dynamically rendered to get one (node_modules/next/dist/docs/01-app/
 * 02-guides/content-security-policy.md, "Forcing dynamic rendering"). This
 * site runs `cacheComponents: true` and prerenders the storefront: the home
 * page, every category and every product are served from the static cache
 * with their inline scripts baked in at build time. A nonce in the header
 * would not be in those scripts, and a strict policy would block the page's
 * own hydration. Making every route dynamic to fix that is the performance
 * regression the cache exists to prevent.
 *
 * What this module does instead is make the gap OBSERVABLE: with a Sentry DSN
 * configured, every CSP violation is reported (`report-uri` for the browsers
 * that still speak it, `report-to` for the ones that moved on), so an
 * injected inline script that the policy would have blocked is at least a
 * Sentry event with a `blocked-uri` and a `script-sample` in it. The list of
 * inline scripts this app writes itself is pinned by
 * lib/security/inline-html.test.ts, so the day the storefront moves off the
 * static cache the set of scripts that need a nonce is already known.
 */
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

export type ContentSecurityPolicyOptions = {
  /** Where violation reports go. Null or absent means no reporting directive. */
  reportUri?: string | null
}

export function contentSecurityPolicyFor(
  pathname: string,
  options: ContentSecurityPolicyOptions = {},
): string {
  const frameAncestors = isPaymentFramePath(pathname)
    ? "frame-ancestors 'self'"
    : "frame-ancestors 'none'"
  const reporting = options.reportUri
    ? [`report-uri ${options.reportUri}`, `report-to ${CSP_REPORT_GROUP}`]
    : []
  return [...BASE_DIRECTIVES, frameAncestors, ...reporting].join('; ')
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

/** The default header value, for the static config that cannot see a path. */
export const DEFAULT_CONTENT_SECURITY_POLICY = contentSecurityPolicyFor('/')

/**
 * The two routes that legitimately open the device camera: the supplier QR
 * scanner (both its addresses). Everywhere else camera stays denied --
 * Permissions-Policy: camera=() on a route the scanner lives on is a scanner
 * that silently cannot see, which is exactly what the static header was doing
 * until 2026-09-02.
 */
export const CAMERA_PATHS = ['/scan', '/supplier/scan'] as const

export function isCameraPath(pathname: string): boolean {
  return CAMERA_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function permissionsPolicyFor(pathname: string): string {
  const camera = isCameraPath(pathname) ? 'camera=(self)' : 'camera=()'
  return `${camera}, microphone=(), geolocation=(), payment=(self)`
}
