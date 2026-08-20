import { GUEST_SESSION_COOKIE } from '@/lib/cart/guest-session-cookie'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Rotate everything that identifies the browser, at the moment it stops being
 * anonymous.
 *
 * WHAT WAS ALREADY TRUE, so that what this adds is clear. `signInWithPassword`
 * and `verifyOtp` mint a fresh access/refresh pair; there is no Supabase API
 * that logs a user into a token someone else chose, so the classic PHP-session
 * fixation -- attacker fixes the id, victim authenticates into it -- has no
 * direct analogue in the auth cookie. Two things around it were still carried
 * across the boundary unchanged:
 *
 * 1. THE GUEST ID. `src/proxy.ts` sets `ke_guest_session` on any request
 *    without one, and it is an attacker-plantable value: a link, a
 *    subdomain, anything that can write a cookie on the site puts a chosen
 *    UUID in a stranger's browser. It keys the cart and, through
 *    `linkAnalyticsIdentity`, the analytics identity. Both login paths deleted
 *    it -- but only INSIDE `if (user && sessionId)`, the branch that merges a
 *    cart. A planted id with no cart behind it fell through that condition and
 *    survived the login intact, still keying the now-authenticated visitor's
 *    events to whatever the planter chose. Deleting it is unconditional here.
 *
 * 2. THE REFRESH TOKEN FROM THE SIGN-IN RESPONSE ITSELF. Long-lived, and the
 *    sign-in is the one exchange where it crosses the wire alongside the
 *    password. `refreshSession()` spends it for a new pair, and GoTrue marks
 *    the spent one revoked, so a copy taken from that response -- a proxy log,
 *    a shared terminal's history, an extension -- is dead by the time the
 *    redirect lands. It costs one round trip on the login path only.
 *
 * NOT `signOut({ scope: 'others' })`. Rotating this browser's session is not a
 * reason to sign the same person out of their phone.
 */

export type RotationOutcome = {
  /** The auth token pair was replaced. False means the old pair is still live. */
  tokenRotated: boolean
  /** A guest id was present and has been cleared. */
  guestCleared: boolean
}

/**
 * FAILS OPEN, and the choice is narrow enough to state exactly: if
 * `refreshSession()` errors, the caller is already signed in with a valid,
 * just-minted session. Refusing the login at that point would turn a Supabase
 * hiccup into "wrong password" for a customer whose password was right, in
 * exchange for revoking a token that was issued seconds ago over TLS. The
 * failure is logged, not swallowed.
 */
export async function rotateSessionAfterLogin(supabase: SupabaseClient): Promise<RotationOutcome> {
  const cookieStore = await cookies()

  const hadGuest = Boolean(cookieStore.get(GUEST_SESSION_COOKIE))
  if (hadGuest) {
    // Unconditional, and it must run whether or not the refresh below works:
    // a planted guest id outliving the login is the half of this that does not
    // depend on the auth server being reachable.
    cookieStore.delete(GUEST_SESSION_COOKIE)
  }

  let tokenRotated = false
  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      log.warn('auth.session_rotation_failed', { reason: error.message })
    } else {
      tokenRotated = Boolean(data.session)
    }
  } catch (error) {
    log.warn('auth.session_rotation_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }

  return { tokenRotated, guestCleared: hadGuest }
}
