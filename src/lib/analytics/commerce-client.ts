'use client'

import {
  type CommerceEventInput,
  type GaEventName,
  buildGaPayload,
  buildMetaPayload,
  metaEventFor,
} from '@/lib/analytics/ecommerce'

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
}
