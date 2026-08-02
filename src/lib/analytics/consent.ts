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
export const CONSENT_WORDING_VERSION = 1

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
