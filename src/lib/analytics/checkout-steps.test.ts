/**
 * @vitest-environment jsdom
 */
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Checkout steps reach PostHog, and only behind the consent gate. Before S26
 * they reached `/api/a` alone, and the PostHog funnel jumped from
 * `begin_checkout` straight to `purchase`.
 */

const trackEvent = vi.hoisted(() => vi.fn())
const isPostHogEnabled = vi.hoisted(() => vi.fn(() => true))
const firstParty = vi.hoisted(() => vi.fn())

vi.mock('@/lib/observability/posthog', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  isPostHogEnabled: () => isPostHogEnabled(),
}))

vi.mock('@/lib/analytics/tracker', () => ({
  track: (...args: unknown[]) => firstParty(...args),
}))

import { trackCheckoutStep } from './checkout-steps'

function setConsent(value: 'granted' | 'denied'): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`${value}.${CONSENT_WORDING_VERSION}`)}`
}

function clearConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

beforeEach(() => {
  trackEvent.mockReset()
  firstParty.mockReset()
  isPostHogEnabled.mockReset().mockReturnValue(true)
  clearConsent()
})

afterEach(() => clearConsent())

describe('trackCheckoutStep', () => {
  it('always hands the step to the first-party tracker', () => {
    trackCheckoutStep('address')
    expect(firstParty).toHaveBeenCalledWith('checkout_step', { step: 'address' })
  })

  it('sends nothing to PostHog before the banner is answered', () => {
    trackCheckoutStep('identity')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends nothing to PostHog when the visitor declined', () => {
    setConsent('denied')
    trackCheckoutStep('identity')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends nothing to PostHog without a key', () => {
    setConsent('granted')
    isPostHogEnabled.mockReturnValue(false)
    trackCheckoutStep('identity')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends the step with its position once consent is granted', () => {
    setConsent('granted')
    trackCheckoutStep('payment_redirect')
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('checkout_step', {
      step: 'payment_redirect',
      step_index: 3,
    })
  })
})
