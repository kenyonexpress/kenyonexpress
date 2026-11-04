'use client'

import { trackingAllowed } from '@/lib/analytics/commerce-client'
import { track } from '@/lib/analytics/tracker'
import { isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'

/**
 * One checkout step, to the first-party pipeline AND to PostHog.
 *
 * WHY THIS EXISTS. Measured 04.11.2026 (S26): the four `checkout_step` calls in
 * CheckoutForm went through `track()` only, which posts to `/api/a` and
 * nowhere else. PostHog saw `begin_checkout` (from `trackCommerce`) and then
 * `purchase` (from the server), with nothing in between, so a shopper who
 * stopped at the address form and one who reached the payment page were the
 * same row in the funnel.
 *
 * The PostHog half sits behind the same two gates every other client-side
 * PostHog call uses: a configured key, and the consent cookie the banner
 * writes. `track()` has its own consent gate inside the Tracker.
 */
export const CHECKOUT_STEPS = ['identity', 'address', 'payment_redirect', 'guest_login'] as const

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

export function trackCheckoutStep(step: CheckoutStep): void {
  track('checkout_step', { step })
  if (typeof window === 'undefined') return
  if (isPostHogEnabled() && trackingAllowed()) {
    trackEvent('checkout_step', {
      step,
      step_index: CHECKOUT_STEPS.indexOf(step) + 1,
    })
  }
}
