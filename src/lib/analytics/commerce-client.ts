'use client'

import { CHECKOUT_VARIANT_PROPERTY, cachedCheckoutVariant } from '@/lib/analytics/checkout-variant'
import { CONSENT_COOKIE, isTrackingAllowed } from '@/lib/analytics/consent'
import {
  type CommerceEventInput,
  type GaEventName,
  buildGaPayload,
  buildMetaPayload,
  metaEventFor,
  toCurrencyAmount,
} from '@/lib/analytics/ecommerce'
import { isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'

/**
 * Firing a commerce event at both vendors from the browser.
 *
 * SAFE TO CALL UNCONDITIONALLY, WHICH IS THE POINT. `gtag` and `fbq` only exist
 * on `window` once `ThirdPartyTags` has mounted them, and it only mounts them
 * after consent. So a call from a shopper who declined finds neither global and
 * does nothing - no queue, no buffer, no "we will send it later". A call site
 * therefore never has to ask about consent, and cannot get the answer wrong.
 *
 * NO REPLAY BUFFER, DELIBERATELY. Buffering pre-consent events and flushing
 * them on Accept would mean collecting behaviour before permission and
 * transmitting it after, which is the thing consent is for. Events that happen
 * before the banner is answered are lost, and that is the correct outcome.
 *
 * POSTHOG IS FANNED OUT FROM HERE TOO, AND IT NEEDS ITS OWN CONSENT CHECK.
 * GA4 and Meta are self-gating: their globals do not exist until ThirdPartyTags
 * mounts them, which is after consent, so a call from a shopper who declined
 * finds nothing and does nothing. PostHog has no SDK and no global -- it is a
 * bare `fetch` to /capture/ -- so there is no absent global to find, and
 * without the explicit check below it would transmit for a visitor who declined
 * while the two vendors that DO have SDKs stayed silent. The gate reads the
 * same cookie the banner writes.
 *
 * That is also the bug this fan-out closes. `NEXT_PUBLIC_POSTHOG_KEY` has been
 * a supported variable with a whole module behind it, and measured on
 * 2026-09-07 `trackEvent` had ZERO callers anywhere in the repo: setting the
 * key produced no events and no error, which is the most expensive kind of
 * silence.
 *
 * THE PURCHASE IS NOT FIRED FROM HERE. `finalizeOrder` reports it server-side,
 * because a browser-side purchase is lost every time a tab closes on the
 * payment redirect or an ad blocker eats the request. If a browser purchase is
 * ever added, it MUST send `eventID: orderId` to Meta and `transaction_id` to
 * GA4 so the two reports deduplicate against the server's.
 */

// `object`, not `Record<string, unknown>`: the payload builders return precise
// interfaces, and a precise interface is not assignable to an index-signature
// type. Widening the builders instead would throw away the field checking that
// keeps `item_id` from being spelled `itemId`.
type Gtag = (command: string, eventName: string, params?: object) => void
type Fbq = (
  command: string,
  eventName: string,
  params?: object,
  options?: { eventID?: string },
) => void

function gtag(): Gtag | null {
  const fn = (window as unknown as { gtag?: Gtag }).gtag
  return typeof fn === 'function' ? fn : null
}

function fbq(): Fbq | null {
  const fn = (window as unknown as { fbq?: Fbq }).fbq
  return typeof fn === 'function' ? fn : null
}

/**
 * The banner's decision, read from the cookie it writes. Denied unless granted.
 * Exported because every OTHER client-side PostHog call site (the pageview in
 * AnalyticsProvider, the referral landing, the replay recorder) needs exactly
 * this gate, and a second implementation is a second place to get it wrong.
 */
export function trackingAllowed(): boolean {
  if (typeof document === 'undefined') return false
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
  return isTrackingAllowed(match ? decodeURIComponent(match[1] ?? '') : null)
}

/**
 * PostHog takes flat properties only, so the item list is summarised rather
 * than nested: a funnel is built on the event and its value, and the per-item
 * detail already goes to GA4 and to the first-party `analytics_events`, which
 * is where the catalogue questions are answered.
 */
function postHogProperties(input: CommerceEventInput): Record<string, string | number | null> {
  const properties: Record<string, string | number | null> = {
    currency: CURRENCY_CODE,
    // Shekels, converted once, by the same helper both vendors use. The agorot
    // integer is the source and stays the source.
    value: toCurrencyAmount(input.valueAgorot),
    value_agorot: Math.round(input.valueAgorot),
    item_count: input.items.length,
    transaction_id: input.transactionId ?? null,
    coupon: input.coupon ?? null,
  }
  // Stamped from the session cache only, synchronously: an event must never
  // wait on a flag fetch, and an event that fires before the checkout page
  // resolved the flag honestly carries nothing. PostHog's experiment analysis
  // reads the `$feature/<flag>` name natively.
  const variant = cachedCheckoutVariant()
  if (variant !== null) properties[CHECKOUT_VARIANT_PROPERTY] = variant
  return properties
}

const CURRENCY_CODE = 'ILS'

export function trackCommerce(name: GaEventName, input: CommerceEventInput): void {
  if (typeof window === 'undefined') return

  const ga = gtag()
  if (ga) {
    try {
      ga('event', name, buildGaPayload(input))
    } catch {
      // A vendor SDK throwing must never break a click handler that is also
      // adding something to a cart.
    }
  }

  const metaName = metaEventFor(name)
  const pixel = metaName ? fbq() : null
  if (metaName && pixel) {
    try {
      pixel(
        'track',
        metaName,
        buildMetaPayload(input),
        // Present only when there is a transaction to key on. Meta ignores an
        // undefined eventID, but sending one keyed on nothing would make two
        // different events look like duplicates of each other.
        input.transactionId ? { eventID: input.transactionId } : undefined,
      )
    } catch {
      // Same reasoning as above.
    }
  }

  // Last, and behind its own gate. Fire and forget by construction: trackEvent
  // never throws and never rejects.
  if (isPostHogEnabled() && trackingAllowed()) {
    trackEvent(name, postHogProperties(input))
  }
}
