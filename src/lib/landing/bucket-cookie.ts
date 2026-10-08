import { isSecureProto } from '@/lib/cart/guest-session-cookie'
import { LANDING_BUCKET_MAX_AGE_SECONDS } from '@/lib/landing/variant'

/**
 * The attributes of the landing bucket cookie (`variant.ts` for what it is).
 *
 * httpOnly: nothing in the browser reads it; the page maps it on the server.
 * A script injected anywhere cannot learn which arm a visitor is in, which
 * is a fact about the experiment and not about the visitor, but still not
 * one to hand out.
 *
 * Path `/lp`: the cookie travels only on landing page requests. Every other
 * request on the site carries one byte less and the cookie cannot be used
 * to recognise a visitor elsewhere.
 *
 * 90 days: long enough that a retargeting click two months later lands in
 * the same arm, short enough that a bucket is not a permanent identifier.
 * The number is reported in the cookie policy from this constant.
 *
 * `secure` is conditional for the reason `guest-session-cookie.ts` spells
 * out: WebKit drops an unconditional Secure cookie over plain http, and the
 * E2E suite runs a WebKit project against http://localhost.
 */
export const LANDING_BUCKET_COOKIE_PATH = '/lp'

export interface LandingBucketCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  maxAge: number
  path: string
  secure: boolean
}

export function landingBucketCookieOptions(
  proto: string | null | undefined,
): LandingBucketCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: LANDING_BUCKET_MAX_AGE_SECONDS,
    path: LANDING_BUCKET_COOKIE_PATH,
    secure: isSecureProto(proto),
  }
}
