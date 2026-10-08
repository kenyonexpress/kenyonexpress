/**
 * The session's decided experiment variants, as one map, where the browser
 * can read them synchronously. Pure and dependency-free: the tracker, the
 * commerce client, the checkout-variant mirror and feature-flags.ts all
 * import this, and none of them may import each other.
 *
 * ONE KEY FOR EVERY FLAG. Until STEP 66 the checkout variant had a key of its
 * own (`ke_ph_checkout_variant`, a bare string). A second and third flag
 * would each have needed another key, another reader and another stamping
 * line in the tracker, and the three could then disagree about whether a
 * decision had happened at all. The map answers that once: `null` means no
 * decision this session (PostHog was never asked, or has not answered yet),
 * and `{}` means PostHog answered and put this browser in no experiment.
 * The difference matters to event stamping: a row fired before the decision
 * carries nothing, honestly, and a row fired after carries exactly the flags
 * the visitor is actually in.
 *
 * sessionStorage, not localStorage: a variant must be sticky within one
 * shopping session so a page does not repaint mid-journey, but a NEW session
 * should re-ask PostHog, otherwise a rollout percentage change never reaches
 * returning browsers.
 */

export const VARIANT_CACHE_KEY = 'ke_ph_variants'

/** flag key -> variant, for the flags this browser is in. */
export type VariantMap = Readonly<Record<string, string>>

/**
 * The property name PostHog's experiment analysis reads natively: an event
 * carrying `$feature/<flag>` counts toward that flag's exposure, with no
 * manual insight configuration. The landing experiments use the same shape.
 */
export function featureProperty(flag: string): string {
  return `$feature/${flag}`
}

function isVariantMap(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
}

/**
 * The decided map, or null before any decision. A tampered or malformed
 * entry reads as null rather than as garbage: the next page asks PostHog
 * again, which is the safe direction.
 */
export function readVariantCache(): VariantMap | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(VARIANT_CACHE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isVariantMap(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Best effort: storage blocked means every page asks PostHog again. */
export function writeVariantCache(map: VariantMap): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(VARIANT_CACHE_KEY, JSON.stringify(map))
  } catch {
    // See above.
  }
}

/**
 * The `$feature/<flag>` properties for a decided map; empty for null. The
 * tracker spreads this UNDER the caller's props, so an emitter that names a
 * property explicitly (the landing page_view does) wins.
 */
export function featureFlagProperties(map: VariantMap | null): Record<string, string> {
  if (!map) return {}
  const out: Record<string, string> = {}
  for (const [flag, variant] of Object.entries(map)) out[featureProperty(flag)] = variant
  return out
}
