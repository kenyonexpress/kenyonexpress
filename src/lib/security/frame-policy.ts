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
 * The CSP directives that never vary. `frame-ancestors` is deliberately absent:
 * it is the one directive that depends on the path, and appending it here as
 * well would produce it twice, where the strictest wins and the exception is
 * silently undone.
 */
const BASE_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://plus.unsplash.com",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co",
  'frame-src https://secure.cardcom.solutions',
  "base-uri 'self'",
  "form-action 'self' https://secure.cardcom.solutions",
  "object-src 'none'",
  'upgrade-insecure-requests',
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
