/**
 * The checkout experiment's flag key, variants, and cached decision. Pure and
 * dependency-free beyond variant-cache.ts on purpose: commerce-client stamps
 * the cached variant onto outgoing events and feature-flags.ts fetches fresh
 * decisions, and if either imported the other the pair would be a cycle.
 * Both import this instead.
 *
 * Since STEP 66 the decision itself lives in the shared session map
 * (`variant-cache.ts`) beside every other experiment's; this module keeps
 * the typed view of ONE flag and the server-readable cookie mirror.
 */

import {
  type VariantMap,
  featureProperty,
  readVariantCache,
  writeVariantCache,
} from '@/lib/analytics/variant-cache'

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
export const CHECKOUT_VARIANT_PROPERTY = featureProperty(CHECKOUT_VARIANT_FLAG)

/**
 * The same decision, mirrored where the SERVER can read it. sessionStorage
 * is invisible to finalize, and finalize is where the revenue fact for the
 * Axiom cohort dashboard is built; without the mirror every purchase would
 * carry `checkout_variant: null` and the per-variant revenue chart would be
 * empty. A session cookie (no Max-Age), so it dies with the tab like the
 * sessionStorage entry. Carries no authority: it labels a bucket.
 */
export const CHECKOUT_VARIANT_COOKIE = 'ke_ckv'

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
 *
 * A decided session that the flag is simply not in reads as control: the
 * page renders control, and the stamping (which reads the map directly)
 * carries no checkout property, which is also honest.
 */
export function cachedCheckoutVariant(): CheckoutVariant | null {
  const map = readVariantCache()
  if (map === null) return null
  return resolveCheckoutVariant(map[CHECKOUT_VARIANT_FLAG])
}

/**
 * Writes the checkout decision into the shared session map (merging with
 * whatever other flags were decided) and mirrors it to the cookie. Kept for
 * the one caller that decides this flag alone; feature-flags.ts writes the
 * whole map in one go and calls `mirrorCheckoutVariantCookie` itself.
 */
export function cacheCheckoutVariant(variant: CheckoutVariant): void {
  if (typeof window === 'undefined') return
  const current: VariantMap = readVariantCache() ?? {}
  writeVariantCache({ ...current, [CHECKOUT_VARIANT_FLAG]: variant })
  mirrorCheckoutVariantCookie(variant)
}

/** Best effort: storage blocked means the server sees no variant and reports null. */
export function mirrorCheckoutVariantCookie(variant: CheckoutVariant): void {
  if (typeof document === 'undefined') return
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CHECKOUT_VARIANT_COOKIE}=${variant}; Path=/; SameSite=Lax${secure}`
  } catch {
    // Storage blocked: the server sees no variant and reports null, honestly.
  }
}
