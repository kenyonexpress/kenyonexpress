/**
 * The ONE definition of the guest session cookie, because there were two.
 *
 * `src/proxy.ts` mints it for a visitor with no session, and
 * `ensureGuestSessionId` mints it inside a server action when the cart is first
 * written. Both wrote their own options object, which is how `secure` came to
 * be missing from both without either looking wrong: each one matched the other.
 *
 * WHY `secure` MATTERS EVEN THOUGH THE SITE IS HSTS-PRELOADED
 *
 * `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` is
 * set on every response, so a browser that has seen this origin before will not
 * make a plaintext request at all. `secure` covers what HSTS cannot: the very
 * first visit from a browser with no pin, on a network that answers port 80.
 * The cookie identifies a cart and, through `/api/a`, a visitor's whole session
 * of analytics — not a password, but not nothing either, and the flag is free.
 *
 * WHY IT IS CONDITIONAL AND NOT ALWAYS ON
 *
 * A `Secure` cookie is dropped by the browser over plain http. Chrome and
 * Firefox make an exception for localhost; WebKit historically does not, and
 * this project's E2E suite runs a WebKit project against `http://localhost` —
 * so an unconditional flag would take the guest cart out in exactly one browser
 * and look like a cart bug rather than a cookie one.
 *
 * `NODE_ENV` cannot be the switch either: `next start` on this laptop is
 * NODE_ENV=production, which is already recorded as a trap here. So the switch
 * is the thing the flag is actually about — whether THIS request arrived over
 * TLS.
 */

export const GUEST_SESSION_COOKIE = 'ke_session_id'

/** Thirty days. Long enough that a shopper's cart survives a weekend. */
export const GUEST_SESSION_MAX_AGE = 60 * 60 * 24 * 30

export interface GuestSessionCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  maxAge: number
  path: '/'
  secure: boolean
}

/**
 * @param proto value of `x-forwarded-proto`, or the request URL's protocol.
 *   Vercel always sets the header; a direct connection has neither, and the
 *   answer there is "not TLS", which is the direction that keeps the cookie
 *   working rather than the one that makes it vanish.
 */
export function guestSessionCookieOptions(
  proto: string | null | undefined,
): GuestSessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: GUEST_SESSION_MAX_AGE,
    path: '/',
    secure: isSecureProto(proto),
  }
}

/**
 * Accepts `https`, `https:` and a comma-separated forwarded chain, taking the
 * FIRST entry — that is the protocol the client used, and the rest describe
 * hops behind the edge that are frequently plain http.
 */
export function isSecureProto(proto: string | null | undefined): boolean {
  if (!proto) return false
  const first = proto.split(',')[0]?.trim().toLowerCase().replace(/:$/, '')
  return first === 'https'
}
