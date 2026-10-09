/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECKOUT_VARIANT_CACHE_KEY } from './checkout-variant'
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from './consent'

/**
 * A flag decides which checkout a paying customer sees, so the tests are
 * about the failure modes: no consent means no network call at all, and every
 * way PostHog can fail (down, slow, misconfigured) resolves to control.
 */

const trackEvent = vi.hoisted(() => vi.fn())
const isPostHogEnabled = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/lib/observability/posthog', () => ({
  isPostHogEnabled: () => isPostHogEnabled(),
  currentDistinctId: () => 'browser-id-1',
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))

type FlagsModule = typeof import('./feature-flags')

async function freshModule(key = 'phc_test'): Promise<FlagsModule> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key)
  return await import('./feature-flags')
}

const fetchSpy = vi.fn()

function decideResponse(flags: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ featureFlags: flags }), { status: 200 })
}

function grantConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`granted.${CONSENT_WORDING_VERSION}`)}`
}

function clearConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

beforeEach(() => {
  fetchSpy.mockReset()
  trackEvent.mockReset()
  isPostHogEnabled.mockReturnValue(true)
  vi.stubGlobal('fetch', fetchSpy)
  window.sessionStorage.clear()
  grantConsent()
})

afterEach(() => {
  clearConsent()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('getCheckoutVariant', () => {
  it('returns the PostHog decision, caches it, and reports the exposure', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ checkout_variant: 'express_summary' }))
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('express_summary')
    expect(window.sessionStorage.getItem(CHECKOUT_VARIANT_CACHE_KEY)).toBe('express_summary')
    expect(trackEvent).toHaveBeenCalledWith('$feature_flag_called', {
      $feature_flag: 'checkout_variant',
      $feature_flag_response: 'express_summary',
    })
  })

  it('makes no network call without consent', async () => {
    clearConsent()
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('control')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('makes no network call without a key', async () => {
    const { getCheckoutVariant } = await freshModule('')
    await expect(getCheckoutVariant()).resolves.toBe('control')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers from the session cache without a second network call', async () => {
    window.sessionStorage.setItem(CHECKOUT_VARIANT_CACHE_KEY, 'express_summary')
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('express_summary')
    expect(fetchSpy).not.toHaveBeenCalled()
    // No second exposure event either: the first page already reported it.
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('resolves to control when PostHog is down, and stays sticky on it', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network down'))
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('control')
    // Cached deliberately: retrying next page could land express mid-journey.
    expect(window.sessionStorage.getItem(CHECKOUT_VARIANT_CACHE_KEY)).toBe('control')
  })

  it('resolves to control on a non-ok response', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 500 }))
    const { getCheckoutVariant } = await freshModule()
    await expect(getCheckoutVariant()).resolves.toBe('control')
  })

  it('folds a boolean flag payload to control instead of leaking it', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ checkout_variant: true }))
    const { getCheckoutVariant } = await freshModule()
    await expect(getCheckoutVariant()).resolves.toBe('control')
  })

  it('shares one in-flight request across simultaneous callers', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ checkout_variant: 'express_summary' }))
    const { getCheckoutVariant } = await freshModule()

    const [a, b] = await Promise.all([getCheckoutVariant(), getCheckoutVariant()])
    expect(a).toBe('express_summary')
    expect(b).toBe('express_summary')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
