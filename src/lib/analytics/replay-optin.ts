/**
 * A second, explicit gate for session replay, on top of cookie consent.
 *
 * The consent banner covers event collection: pages viewed, items carted,
 * aggregate numbers. A replay is a different animal, a frame-by-frame
 * recording of everything on screen, and burying it inside the general
 * "usage data" yes would stretch that consent past what the banner's words
 * actually say. Changing the banner to mention recording would bump
 * CONSENT_WORDING_VERSION and re-ask every visitor who already answered, a
 * heavy price for a debugging tool most shoppers will never need.
 *
 * So replay is opt-in from the account area instead: OFF for everyone until
 * the shopper flips it on (typically while working with support on a problem
 * only a recording can show). The recorder mounts only when BOTH are true:
 * the banner consent, because the recorder is still PostHog receiving
 * behavioral data, and this cookie, because a recording needs its own yes.
 */

import { isTrackingAllowed } from '@/lib/analytics/consent'

export const REPLAY_OPTIN_COOKIE = 'ke_replay_optin'

/** Serialized value for the opted-in state; any other value reads as off. */
export const REPLAY_OPTIN_VALUE = '1'

/**
 * Six months, deliberately shorter than the 12-month consent cookie: a replay
 * opt-in given for one support case should quietly lapse, not follow the
 * account around for a year.
 */
export const REPLAY_OPTIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

/** Window event the toggle dispatches so a mounted recorder reacts in-page. */
export const REPLAY_OPTIN_CHANGED_EVENT = 'ke:replay-optin-changed'

export function parseReplayOptIn(raw: string | undefined | null): boolean {
  return raw === REPLAY_OPTIN_VALUE
}

/**
 * Whether the recorder may run right now, given both cookies' raw values.
 * Consent carries its wording-version rules; the opt-in is a plain switch.
 */
export function isReplayAllowed(
  consentRaw: string | undefined | null,
  optInRaw: string | undefined | null,
): boolean {
  return isTrackingAllowed(consentRaw) && parseReplayOptIn(optInRaw)
}

function cookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

/** The browser's current opt-in state. False wherever cookies are unreadable. */
export function readReplayOptIn(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return parseReplayOptIn(cookieValue(REPLAY_OPTIN_COOKIE))
  } catch {
    return false
  }
}

/**
 * Writes the decision and tells the page about it. Not httpOnly by nature
 * (JavaScript owns this preference, like the distinct-id mirror), SameSite=Lax
 * so it stays off cross-site requests; it authorises nothing server-side.
 * Opting out deletes the cookie rather than storing a "no": absence and
 * refusal mean the same thing here, and a stored refusal would only be one
 * more value a future parser could misread.
 */
export function writeReplayOptIn(optIn: boolean): void {
  if (typeof document === 'undefined') return
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    const maxAge = optIn ? REPLAY_OPTIN_MAX_AGE_SECONDS : 0
    const value = optIn ? REPLAY_OPTIN_VALUE : ''
    document.cookie = `${REPLAY_OPTIN_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
    window.dispatchEvent(new Event(REPLAY_OPTIN_CHANGED_EVENT))
  } catch {
    // Storage blocked: the toggle simply does not stick, and the recorder
    // stays off, which is the safe side of this preference.
  }
}
