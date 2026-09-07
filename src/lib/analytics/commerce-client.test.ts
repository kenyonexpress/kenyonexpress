/**
 * @vitest-environment jsdom
 */
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The fan-out, and above all the gate in front of PostHog.
 *
 * GA4 and Meta gate themselves: their globals do not exist until the consent
 * banner has been answered, so a declined visitor's call finds nothing. PostHog
 * has no SDK and no global, so its gate has to be explicit, and a test that
 * only checked "it sends" would pass on a version that sends for everyone.
 */

const trackEvent = vi.hoisted(() => vi.fn())
const isPostHogEnabled = vi.hoisted(() => vi.fn(() => true))

vi.mock('@/lib/observability/posthog', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  isPostHogEnabled: () => isPostHogEnabled(),
}))

import { trackCommerce } from './commerce-client'

const INPUT = {
  items: [
    { id: 'p1', name: 'x', priceAgorot: 5_000, quantity: 1 },
    { id: 'p2', name: 'y', priceAgorot: 2_500, quantity: 2 },
  ],
  valueAgorot: 10_000,
  transactionId: 'order-9',
  coupon: null,
}

function grantConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`granted.${CONSENT_WORDING_VERSION}`)}`
}

function denyConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`denied.${CONSENT_WORDING_VERSION}`)}`
}

function clearConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

beforeEach(() => {
  trackEvent.mockReset()
  isPostHogEnabled.mockReset().mockReturnValue(true)
  clearConsent()
})

afterEach(() => {
  clearConsent()
})

describe('trackCommerce -> PostHog', () => {
  it('sends nothing when the visitor has not answered the banner', () => {
    trackCommerce('purchase', INPUT)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends nothing when the visitor declined', () => {
    denyConsent()
    trackCommerce('purchase', INPUT)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends nothing when no key is configured, whatever the consent', () => {
    grantConsent()
    isPostHogEnabled.mockReturnValue(false)
    trackCommerce('purchase', INPUT)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends the event once consent is granted, in shekels and in agorot', () => {
    grantConsent()
    trackCommerce('purchase', INPUT)

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('purchase', {
      currency: 'ILS',
      // The decimal both vendors get, from the same helper, and the integer it
      // came from. A funnel that only carries the float loses the source.
      value: 100,
      value_agorot: 10_000,
      item_count: 2,
      transaction_id: 'order-9',
      coupon: null,
    })
  })

  it('carries a null transaction id rather than omitting the key', () => {
    grantConsent()
    trackCommerce('add_to_cart', { ...INPUT, transactionId: undefined })
    expect(trackEvent).toHaveBeenCalledWith(
      'add_to_cart',
      expect.objectContaining({ transaction_id: null }),
    )
  })

  it('does not throw when the vendor globals are absent', () => {
    // The whole file is written to be safe to call unconditionally.
    grantConsent()
    expect(() => trackCommerce('view_item', INPUT)).not.toThrow()
  })
})
