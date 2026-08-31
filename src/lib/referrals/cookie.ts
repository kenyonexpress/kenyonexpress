import { isSecureProto } from '@/lib/cart/guest-session-cookie'

/**
 * The cookie that carries a referral code from the landing page to the signup.
 *
 * WHY A COOKIE AND NOT THE URL
 *
 * Between clicking a share link and finishing a signup, a visitor passes
 * through a product page, a cart, a login form and (for Google and for magic
 * links) a round trip through a provider that returns to a URL this app does
 * not compose. The query parameter survives none of that. The claim happens at
 * `/auth/callback`, which is reached from an email client or from Google, so
 * the code has to have been written down somewhere before the journey started.
 *
 * WHY httpOnly
 *
 * Nothing in the browser reads it. The two readers are the auth callback and
 * the phone-OTP verify action, both server side. Keeping it off `document.cookie`
 * costs nothing and means a script injected into any page cannot read back who
 * referred the visitor, which is a fact about two people and not one.
 *
 * WHY 30 DAYS
 *
 * The same window as the guest cart, for the same reason: someone who clicks a
 * friend's link on a Friday and buys the following week is the ordinary case,
 * not the edge one. The database has its own, authoritative window,
 * `referral_program_settings.qualify_window_days`, counted from the CLAIM and
 * enforced by `fn_complete_referral`, so a stale cookie cannot pay a bonus
 * outside the terms. This number only decides how long a link stays warm.
 */
export const REFERRAL_COOKIE = 'ke_ref'

/** Thirty days, matching the guest cart. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export interface ReferralCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  maxAge: number
  path: '/'
  secure: boolean
}

/**
 * @param proto value of `x-forwarded-proto`, or the request URL's protocol.
 *   `secure` is conditional for exactly the reason spelled out in
 *   `guest-session-cookie.ts`: an unconditional flag is dropped by WebKit over
 *   plain http, and the E2E suite runs a WebKit project against
 *   `http://localhost`. That helper owns the parsing; this one owns the policy.
 */
export function referralCookieOptions(proto: string | null | undefined): ReferralCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: '/',
    secure: isSecureProto(proto),
  }
}
