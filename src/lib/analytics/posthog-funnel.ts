/**
 * The canonical PostHog purchase funnel, in one place.
 *
 * PostHog receives events from three emitters that each own a piece of the
 * journey: AnalyticsProvider ($pageview), trackCommerce (the GA-named browser
 * commerce events, consent-gated), and trackServerEvent (the money moments,
 * never gated, filed under the mirrored browser id so they join). Nothing in
 * the code needed the whole sequence until insights did: a funnel built in the
 * PostHog UI is configured by typing event names, and a typo there is a funnel
 * that silently reports zero conversions. This module is the sequence an
 * analyst copies from, and the test beside it locks every name to the module
 * that actually emits it, so a rename upstream breaks the build instead of the
 * dashboard.
 *
 * begin_checkout appears once here but arrives from BOTH halves on purpose:
 * the browser fires it when the checkout page mounts (the moment ad platforms
 * optimise against) and the server fires it again at submit. A PostHog funnel
 * counts a step when ANY matching event exists for the distinct_id, so the
 * duplication widens coverage (an ad blocker eats the browser one, a bounced
 * submit never sends the server one) without double-counting conversions.
 */

export type FunnelOrigin = 'client' | 'server' | 'both'

export interface PurchaseFunnelStep {
  /** The event name exactly as it reaches PostHog. */
  event: string
  origin: FunnelOrigin
  /** Properties an insight can safely break down on at this step. */
  breakdowns: readonly string[]
}

export const PURCHASE_FUNNEL: readonly PurchaseFunnelStep[] = [
  // The SDK-reserved name, sent by AnalyticsProvider beside the first-party
  // page_view. Funnels and web analytics in PostHog are built on it.
  { event: '$pageview', origin: 'client', breakdowns: ['route'] },
  // GA taxonomy from here down to begin_checkout: trackCommerce fans the same
  // built event out to GA4, Meta and PostHog, so PostHog shares GA4's names.
  { event: 'view_item', origin: 'client', breakdowns: ['value', 'item_count'] },
  { event: 'add_to_cart', origin: 'client', breakdowns: ['value', 'item_count'] },
  {
    event: 'begin_checkout',
    origin: 'both',
    breakdowns: ['value', 'item_count', CHECKOUT_VARIANT_PROPERTY_NAME()],
  },
  // Server taxonomy: emitted by trackServerEvent only, because a browser
  // purchase is lost every time a tab closes on the payment redirect.
  { event: 'purchase', origin: 'server', breakdowns: ['order_id', 'user_id'] },
] as const

/**
 * Person properties cohorts are built on. `$set` on a server event writes
 * them; a PostHog cohort ("cashback_tier = gold") then matches the person for
 * every event they ever sent. Values must come from the matching module so the
 * cohort filter and the writer cannot drift.
 */
export const COHORT_PERSON_PROPERTIES = ['cashback_tier'] as const

// A function rather than an import, to keep this module dependency-free (it
// is documentation-as-code and must never pull browser or server code into a
// bundle that only wanted the list). The test locks it to the real constant.
function CHECKOUT_VARIANT_PROPERTY_NAME(): string {
  return '$feature/checkout_variant'
}

/** The funnel's event names in order, for tests and for pasting into PostHog. */
export function purchaseFunnelEventNames(): string[] {
  return PURCHASE_FUNNEL.map((step) => step.event)
}
