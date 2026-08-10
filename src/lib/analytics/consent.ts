// Cookie consent for behavioral analytics.
//
// Business records (orders, payments, redemptions, wallet, begin_checkout) are
// never gated: they are part of a transaction the user initiated. Browser
// events are. web_vital rides the same pipeline with the same session ids, so
// it sits behind the same gate, conservatively.

export const CONSENT_COOKIE = 'ke_consent'
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 12 months

// Bump when the banner wording changes materially. A stored decision made
// against older wording is re-asked rather than silently carried over.
//
// 1 -> 2 (10.08): the banner used to promise "בלי העברה לצד שלישי" - no
// transfer to a third party - and it was true, because collection was
// first-party only. GA4 and the Meta Pixel make it false. A consent given to
// the old sentence cannot cover Google and Meta, however the cookie is spelled,
// so every visitor is asked again. This is the exact situation the version
// field was added for, and skipping the bump would have been the quiet kind of
// wrong: the same cookie value silently meaning something it never meant.
export const CONSENT_WORDING_VERSION = 2

export type ConsentDecision = 'granted' | 'denied'

export type ConsentState = {
  decision: ConsentDecision
  wordingVersion: number
}

/** Serialized as `granted.1` so it stays a single short cookie value. */
export function serializeConsent(state: ConsentState): string {
  return `${state.decision}.${state.wordingVersion}`
}

export function parseConsent(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null
  const [decision, version] = raw.split('.')
  if (decision !== 'granted' && decision !== 'denied') return null
  const wordingVersion = Number(version)
  if (!Number.isInteger(wordingVersion) || wordingVersion < 1) return null
  return { decision, wordingVersion }
}

/**
 * Whether browser events may be collected right now. A decision recorded
 * against superseded wording does not count as consent.
 */
export function isTrackingAllowed(raw: string | undefined | null): boolean {
  const state = parseConsent(raw)
  return state?.decision === 'granted' && state.wordingVersion >= CONSENT_WORDING_VERSION
}

/** True when the banner still has to be shown (no decision, or stale wording). */
export function needsConsentDecision(raw: string | undefined | null): boolean {
  const state = parseConsent(raw)
  return state === null || state.wordingVersion < CONSENT_WORDING_VERSION
}

/**
 * Set on <html> by the pre-paint snippet below when a current decision exists.
 * CSS in globals.css hides the banner off it.
 */
export const CONSENT_DECIDED_ATTRIBUTE = 'data-consent'
export const CONSENT_DECIDED_VALUE = 'decided'

/**
 * WHY THE BANNER IS NOT GATED ON A useEffect ANY MORE.
 *
 * It used to render only after mount, which kept the server HTML identical for
 * every visitor. It also made the banner's paragraph - 382x91 on a 412px phone,
 * the largest thing in the viewport - paint only once hydration finished. That
 * paragraph WAS the homepage's LCP element, and Lighthouse mobile put it at
 * 5.1s while first paint was 1.7s: the whole 3.4s gap was the JS wait, and LCP
 * alone (weight 25, score 0.24) was what held the page at 80.
 *
 * So the markup now ships in the response for everyone, and this snippet, which
 * runs before the parser reaches the banner, marks the document for the
 * visitors who already decided. Hiding is CSS, so it happens at first paint and
 * there is no flash. The HTML stays identical for every visitor and stays
 * cacheable, which was the point of the useEffect in the first place.
 *
 * It mirrors `needsConsentDecision` and is locked to it by consent.test.ts,
 * which runs both over the same table of cookie values. Keep them in step: the
 * failure mode of a drift is a banner shown to someone who already answered, or
 * a banner never shown at all.
 */
export const CONSENT_PREPAINT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=([^;]*)/);if(!m)return;var p=decodeURIComponent(m[1]).split(".");var v=Number(p[1]);if((p[0]==="granted"||p[0]==="denied")&&Number.isInteger(v)&&v>=${CONSENT_WORDING_VERSION})document.documentElement.setAttribute("${CONSENT_DECIDED_ATTRIBUTE}","${CONSENT_DECIDED_VALUE}")}catch(e){}})()`
