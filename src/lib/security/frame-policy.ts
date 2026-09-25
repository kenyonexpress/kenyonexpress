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
/**
 * Cloudflare Turnstile needs three directives opened, and they are opened ONLY
 * when the widget can actually render.
 *
 * The challenge loads a script from `challenges.cloudflare.com`, draws itself in
 * an iframe from the same host, and posts the solved token back to it. Miss any
 * one of the three and the widget fails in the way that costs the most: it
 * renders nothing, no `cf-turnstile-response` field is ever added to the form,
 * and every submission is refused as "missing token" - a broken signup page
 * whose only symptom is in the browser console.
 *
 * GATED ON THE SITE KEY, and that gate is exact rather than cautious.
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined into the browser bundle at build
 * time, so the same build that has no site key has no widget, and the header
 * that ships with it should not name a host nothing will contact. When the key
 * is set the widget exists and the host is required. There is no configuration
 * in which one is true and the other is not.
 */
const TURNSTILE_HOST = 'https://challenges.cloudflare.com'
const turnstileConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())
const withTurnstile = (directive: string): string =>
  turnstileConfigured ? `${directive} ${TURNSTILE_HOST}` : directive

/**
 * THE MOCK PROVIDER'S HOSTED PAGE IS ON OUR OWN ORIGIN, AND THE CSP REFUSED IT.
 *
 * `frame-src https://secure.cardcom.solutions` names exactly one host, which is
 * right for a real charge and wrong for every configuration that runs the mock:
 * a local checkout, a preview deployment, and the Playwright money path. In
 * those, `createLowProfile` returns a URL on this origin, the checkout mounts it
 * in the payment iframe, and Chrome answers
 *
 *   Framing 'http://localhost:3311/checkout/frame-return?...' violates the
 *   following Content Security Policy directive: "frame-src
 *   https://secure.cardcom.solutions". The request has been blocked.
 *
 * The shopper sees an empty box below a filled-in checkout and the order stays
 * `pending` forever. Measured 2026-09-10 on the production build; the paid
 * Playwright suite could not have passed against it.
 *
 * OPENED ONLY FOR THE MOCK, and the condition below is a RESTATEMENT of
 * `loadCardcomEnv`'s `useMock` rather than a simpler stand-in for it. The
 * simpler stand-in was written first and had a hole: `CARDCOM_USE_MOCK === 'true'`
 * alone leaves the directive closed under `next dev` with no terminal number,
 * which is the default local setup and the exact case that is guaranteed to be
 * running the mock. Anything the two could disagree about is a checkout that
 * renders an empty payment box, so `frame-policy-matches-provider.test.ts`
 * holds them to the same answer over the whole configuration matrix.
 *
 * It is restated rather than imported because `next.config.ts` loads this
 * module directly, before the tsconfig path aliases exist - the same reason the
 * import at the top of the file is relative.
 *
 * `'self'` is a narrow grant regardless. The only page it lets us frame is
 * /checkout/frame-return, which is also the only path `frame-ancestors 'self'`
 * applies to; every other route still refuses to be framed by anyone at all.
 */
export function usesMockPaymentProvider(source: NodeJS.ProcessEnv = process.env): boolean {
  return (
    source.CARDCOM_USE_MOCK === 'true' ||
    source.NODE_ENV === 'test' ||
    (!source.CARDCOM_TERMINAL_NUMBER && source.NODE_ENV !== 'production')
  )
}

const mockPaymentProvider = usesMockPaymentProvider()
const withMockFrame = (directive: string): string =>
  mockPaymentProvider ? `${directive} 'self'` : directive

/**
 * `upgrade-insecure-requests` ONLY WHEN THE SITE IS SERVED OVER HTTPS.
 *
 * The directive tells the browser to rewrite every `http:` subresource and
 * redirect target to `https:`. On the deployment that is a no-op safety net.
 * On a local production build it is a fault: MEASURED 2026-09-25 with
 * Lighthouse against `pnpm start` on `http://localhost:3461`, the router
 * prefetch of `/account`, `/account/wallet` and `/account/wishlist` from the
 * header was answered by the proxy with a relative `Location: /login?next=...`,
 * Chrome upgraded that redirect to `https://localhost:3461/login?...`, and the
 * page logged three `net::ERR_SSL_PROTOCOL_ERROR` lines. Three failed
 * prefetches on every page and a Best Practices score of 96 for an error that
 * cannot happen where the header is meant to apply.
 *
 * The switch is the configured site origin, the same variable `siteUrl()`
 * reads, because it is the one thing that says which scheme this build is
 * addressed at. Unset means the production default, which is https.
 */
export function upgradesInsecureRequests(source: NodeJS.ProcessEnv = process.env): boolean {
  return !/^http:\/\//i.test(source.NEXT_PUBLIC_APP_URL?.trim() ?? '')
}

const BASE_DIRECTIVES = [
  "default-src 'self'",
  withTurnstile("script-src 'self' 'unsafe-inline'"),
  "style-src 'self' 'unsafe-inline'",
  IMG_SRC,
  "font-src 'self'",
  // Both schemes, because supabase-js opens the in-app notification feed
  // (NotificationBell) over a realtime websocket to the same project host, and
  // connect-src does not treat wss:// as covered by https://. Without the
  // second entry every signed-in page logged one CSP violation per mount and
  // the bell never received a live event (route audit, 25.09).
  withTurnstile("connect-src 'self' https://*.supabase.co wss://*.supabase.co"),
  withMockFrame(withTurnstile('frame-src https://secure.cardcom.solutions')),
  "base-uri 'self'",
  "form-action 'self' https://secure.cardcom.solutions",
  "object-src 'none'",
  ...(upgradesInsecureRequests() ? (['upgrade-insecure-requests'] as const) : []),
] as const

export function contentSecurityPolicyFor(pathname: string): string {
  const frameAncestors = isPaymentFramePath(pathname)
    ? "frame-ancestors 'self'"
    : "frame-ancestors 'none'"
  return [...BASE_DIRECTIVES, frameAncestors].join('; ')
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
