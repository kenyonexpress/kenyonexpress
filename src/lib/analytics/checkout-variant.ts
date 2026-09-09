/**
 * The checkout experiment's flag key, variants, and cached decision. Pure and
 * dependency-free on purpose: commerce-client stamps the cached variant onto
 * outgoing events and feature-flags.ts fetches fresh decisions, and if either
 * imported the other the pair would be a cycle. Both import this instead.
 */

/** The flag key exactly as configured in PostHog's feature flags UI. */
export const CHECKOUT_VARIANT_FLAG = 'checkout_variant'

/**
 * Every variant the checkout knows how to render. A value outside this list
 * (a typo in the PostHog UI, a boolean from a mis-configured flag, a payload
 * from a stale cache) resolves to control rather than to an unstyled page.
 */
export const CHECKOUT_VARIANTS = ['control', 'express_summary'] as const
export type CheckoutVariant = (typeof CHECKOUT_VARIANTS)[number]

/**
 * The property name PostHog's experiment analysis reads natively: an event
 * carrying `$feature/<flag>` counts toward that flag's exposure, with no
 * manual insight configuration.
 */
export const CHECKOUT_VARIANT_PROPERTY = `$feature/${CHECKOUT_VARIANT_FLAG}`

/**
 * sessionStorage, not localStorage: a variant must be sticky within one
 * shopping session so the checkout does not repaint mid-journey, but a NEW
 * session should re-ask PostHog, otherwise a rollout percentage change never
 * reaches returning browsers.
 */
export const CHECKOUT_VARIANT_CACHE_KEY = 'ke_ph_checkout_variant'

export function resolveCheckoutVariant(raw: unknown): CheckoutVariant {
  return (CHECKOUT_VARIANTS as readonly unknown[]).includes(raw)
    ? (raw as CheckoutVariant)
    : 'control'
}

/**
 * The session's already-decided variant, synchronously, or null before the
 * first fetch resolves. Callers that stamp events use this: an event fired
 * before the decision exists carries nothing, which is honest, rather than a
 * guessed control that would misfile the shopper if the fetch lands express.
 */
export function cachedCheckoutVariant(): CheckoutVariant | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_VARIANT_CACHE_KEY)
    if (raw === null) return null
    return resolveCheckoutVariant(raw)
  } catch {
    return null
  }
}

/** Best effort: storage blocked means every page asks PostHog again. */
export function cacheCheckoutVariant(variant: CheckoutVariant): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CHECKOUT_VARIANT_CACHE_KEY, variant)
  } catch {
    // See above.
  }
}
