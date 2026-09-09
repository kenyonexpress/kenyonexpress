/**
 * PostHog feature flags over the public /decide endpoint, SDK-free like every
 * other PostHog call in this app (see lib/observability/posthog.ts for why).
 *
 * One flag exists today: the checkout variant. The resolver is deliberately
 * flag-specific rather than a generic getFlag(key), because a generic reader
 * invites unvalidated string comparisons at call sites, and the whole point of
 * checkout-variant.ts is that an unknown value can only ever mean control.
 *
 * FAILURE IS CONTROL, ALWAYS. A flag decides which checkout a paying customer
 * sees, so this module must never make checkout wait on PostHog being up: the
 * fetch has a hard 2s timeout, every error path resolves (never rejects) to
 * control, and a resolved decision is cached for the session so the page never
 * flips variants mid-journey.
 *
 * CONSENT GATES THE CALL. /decide transmits the visitor's distinct id to
 * PostHog, which is exactly the data flow the banner asks about. A visitor who
 * declined (or has not answered) gets control without any network call, which
 * also means experiments only measure consented traffic; the two halves of an
 * A/B report then come from the same population.
 */

import {
  CHECKOUT_VARIANT_FLAG,
  type CheckoutVariant,
  cacheCheckoutVariant,
  cachedCheckoutVariant,
  resolveCheckoutVariant,
} from '@/lib/analytics/checkout-variant'
import { CONSENT_COOKIE, isTrackingAllowed } from '@/lib/analytics/consent'
import { currentDistinctId, isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(
  /\/+$/,
  '',
)

/**
 * The banner's decision, read off the cookie it writes. Duplicates the three
 * lines of commerce-client's trackingAllowed on purpose: importing it from
 * there would couple the flags module to a file several tests replace with a
 * `{ trackCommerce }`-only mock, and a flag gate must not throw because a
 * TEST mocked an unrelated event function.
 */
function consentGranted(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
    return isTrackingAllowed(match?.[1] ? decodeURIComponent(match[1]) : null)
  } catch {
    return false
  }
}

/** One in-flight request per page, so a burst of callers shares the answer. */
let pending: Promise<CheckoutVariant> | null = null

async function fetchVariant(): Promise<CheckoutVariant> {
  const response = await fetch(`${HOST}/decide/?v=3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: KEY, distinct_id: currentDistinctId() }),
    signal: AbortSignal.timeout(2_000),
  })
  if (!response.ok) return 'control'
  const payload = (await response.json()) as { featureFlags?: Record<string, unknown> }
  return resolveCheckoutVariant(payload.featureFlags?.[CHECKOUT_VARIANT_FLAG])
}

/**
 * The variant this browser should render, resolving in at most ~2s and never
 * rejecting. First call per session asks PostHog and reports the exposure
 * (`$feature_flag_called` is the event PostHog's experiment results read);
 * later calls answer from the session cache with no network.
 */
export function getCheckoutVariant(): Promise<CheckoutVariant> {
  const cached = cachedCheckoutVariant()
  if (cached !== null) return Promise.resolve(cached)
  if (typeof window === 'undefined' || !isPostHogEnabled() || !KEY || !consentGranted()) {
    return Promise.resolve('control')
  }
  if (pending) return pending

  pending = fetchVariant()
    .catch(() => 'control' as const)
    .then((variant) => {
      cacheCheckoutVariant(variant)
      // Exposure event AFTER the cache write: if this browser reloads between
      // the two, a cached variant with no exposure event undercounts the
      // experiment, while an exposure event for an uncached variant would
      // claim the shopper saw something the next page may re-decide.
      trackEvent('$feature_flag_called', {
        $feature_flag: CHECKOUT_VARIANT_FLAG,
        $feature_flag_response: variant,
      })
      return variant
    })
    .finally(() => {
      pending = null
    })
  return pending
}
