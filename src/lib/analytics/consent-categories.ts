/**
 * Granular cookie consent categories for C63.
 *
 * Three categories:
 * - Essential: Always true, cannot be disabled (auth, cart, security)
 * - Analytics: GA4, PostHog, performance monitoring
 * - Marketing: Meta Pixel, ad platforms, remarketing
 */

export const CONSENT_CATEGORIES = {
  essential: 'essential',
  analytics: 'analytics',
  marketing: 'marketing',
} as const

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[keyof typeof CONSENT_CATEGORIES]

export interface GranularConsent {
  essential: boolean // Always true
  analytics: boolean
  marketing: boolean
  wordingVersion: number
}

export const CONSENT_GRANULAR_COOKIE = 'ke_consent_prefs'
export const CONSENT_GRANULAR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 12 months

/**
 * Serialize granular consent as: essential.analytics.marketing.version
 * Example: "1.1.0.2" = essential + analytics, no marketing, version 2
 */
export function serializeGranularConsent(state: GranularConsent): string {
  return `${state.essential ? '1' : '0'}.${state.analytics ? '1' : '0'}.${state.marketing ? '1' : '0'}.${state.wordingVersion}`
}

/**
 * Parse granular consent from cookie value
 */
export function parseGranularConsent(raw: string | undefined | null): GranularConsent | null {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 4) return null

  const [essential, analytics, marketing, version] = parts
  const wordingVersion = Number(version)

  if (!Number.isInteger(wordingVersion) || wordingVersion < 1) return null
  if (essential !== '0' && essential !== '1') return null
  if (analytics !== '0' && analytics !== '1') return null
  if (marketing !== '0' && marketing !== '1') return null

  return {
    essential: essential === '1',
    analytics: analytics === '1',
    marketing: marketing === '1',
    wordingVersion,
  }
}

/**
 * Check if a specific category is allowed
 */
export function isCategoryAllowed(
  raw: string | undefined | null,
  category: ConsentCategory,
  currentVersion: number,
): boolean {
  const state = parseGranularConsent(raw)
  if (!state) return false
  if (state.wordingVersion < currentVersion) return false

  return state[category] === true
}

/**
 * Default consent state: all denied except essential
 */
export function getDefaultConsent(wordingVersion: number): GranularConsent {
  return {
    essential: true,
    analytics: false,
    marketing: false,
    wordingVersion,
  }
}

/**
 * Accept all consent state
 */
export function getAcceptAllConsent(wordingVersion: number): GranularConsent {
  return {
    essential: true,
    analytics: true,
    marketing: true,
    wordingVersion,
  }
}

/**
 * Reject all consent state (essential always stays true)
 */
export function getRejectAllConsent(wordingVersion: number): GranularConsent {
  return {
    essential: true,
    analytics: false,
    marketing: false,
    wordingVersion,
  }
}
