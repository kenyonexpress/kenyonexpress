import { isSecureProto } from '@/lib/cart/guest-session-cookie'

/**
 * The `Secure` flag on the Supabase session cookie, which it did not have.
 *
 * WHAT WAS MEASURED
 *
 * `@supabase/ssr` 0.10.3 ships `DEFAULT_COOKIE_OPTIONS` as
 * `{ path, sameSite: 'lax', httpOnly: false, maxAge }` — there is no `secure`
 * key in it, and nothing in `createServerClient` or `createBrowserClient` adds
 * one. Run against the library's own `applyServerStorage`:
 *
 *     no cookieOptions   -> { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 34560000 }
 *     { secure: true }   -> { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 34560000, secure: true }
 *
 * So the flag is ours to pass or to leave off, and every caller here left it
 * off. The cookie carrying the access and refresh tokens was the ONE cookie
 * this app sets without it: `ke_session_id` (a cart id) and `ke_ref` (a
 * referral code) both go through `guestSessionCookieOptions` and
 * `referralCookieOptions`, which set it. The least valuable cookie was
 * protected and the most valuable one was not, and each of the three looked
 * complete on its own screen.
 *
 * WHY THE SAME CONDITIONAL AND NOT `true`
 *
 * `guest-session-cookie.ts` owns the reasoning and this file does not repeat
 * it: a `Secure` cookie is dropped over plain http, `NODE_ENV` is not the
 * switch because `next start` on this laptop is already NODE_ENV=production,
 * and the honest switch is whether THIS request arrived over TLS. A session
 * cookie that silently vanishes on localhost reads as a login bug, and the
 * person debugging it is not looking at cookie flags.
 *
 * WHY `httpOnly` IS NOT SET HERE, AND MUST NOT BE
 *
 * This is the flag the auth cookie genuinely cannot have. `createBrowserClient`
 * reads the session back out of `document.cookie`; that is the whole storage
 * adapter. Setting `httpOnly: true` does not harden the session, it hides it
 * from the client that needs it, and every browser-side `getUser()` starts
 * answering "signed out" while the server still sees a session. The mitigation
 * for script access is the CSP, not this flag.
 */
export interface SupabaseAuthCookieOptions {
  secure: boolean
}

/**
 * @param proto value of `x-forwarded-proto`, or the request URL's protocol.
 *   Vercel always sets the header; a direct connection has neither, and the
 *   answer there is "not TLS" — the direction that keeps the session working
 *   rather than the one that makes it vanish.
 */
export function supabaseAuthCookieOptions(
  proto: string | null | undefined,
): SupabaseAuthCookieOptions {
  return { secure: isSecureProto(proto) }
}

/**
 * The browser's own answer to the same question.
 *
 * `window` is guarded because this module is imported by a client component
 * that may be rendered on the server first; there the client is not built and
 * the value is never read, but the property access would still throw.
 */
export function browserAuthCookieOptions(): SupabaseAuthCookieOptions {
  if (typeof window === 'undefined') return { secure: false }
  return { secure: window.location.protocol === 'https:' }
}
