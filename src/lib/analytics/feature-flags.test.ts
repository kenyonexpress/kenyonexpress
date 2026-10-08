/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECKOUT_VARIANT_COOKIE } from './checkout-variant'
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from './consent'
import {
  CHECKOUT_BUTTON_COLOR_EXPERIMENT,
  CTA_COPY_EXPERIMENT,
  EXPERIMENTS,
  HOME_HERO_EXPERIMENT,
} from './experiments'
import { VARIANT_CACHE_KEY } from './variant-cache'

/**
 * A flag decides which checkout a paying customer sees, so the tests are
 * about the failure modes: no consent means no network call at all, and every
 * way PostHog can fail (down, slow, misconfigured) resolves to control.
 *
 * Since STEP 66 one /decide call answers every registered experiment, and the
 * answer is one session map; the second half of this file is that contract.
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

function cached(): unknown {
  const raw = window.sessionStorage.getItem(VARIANT_CACHE_KEY)
  return raw === null ? null : JSON.parse(raw)
}

function cacheMap(map: Record<string, string>): void {
  window.sessionStorage.setItem(VARIANT_CACHE_KEY, JSON.stringify(map))
}

beforeEach(() => {
  fetchSpy.mockReset()
  trackEvent.mockReset()
  isPostHogEnabled.mockReturnValue(true)
  vi.stubGlobal('fetch', fetchSpy)
  window.sessionStorage.clear()
  document.cookie = `${CHECKOUT_VARIANT_COOKIE}=; Max-Age=0; Path=/`
  grantConsent()
})

afterEach(() => {
  clearConsent()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('getCheckoutVariant', () => {
  it('returns the PostHog decision, caches it, mirrors the cookie, and reports the exposure', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ checkout_variant: 'express_summary' }))
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('express_summary')
    expect(cached()).toEqual({ checkout_variant: 'express_summary' })
    expect(document.cookie).toContain(`${CHECKOUT_VARIANT_COOKIE}=express_summary`)
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
    // Nothing cached either: a visitor who consents later is asked then.
    expect(cached()).toBeNull()
  })

  it('makes no network call without a key', async () => {
    const { getCheckoutVariant } = await freshModule('')
    await expect(getCheckoutVariant()).resolves.toBe('control')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers from the session cache without a second network call', async () => {
    cacheMap({ checkout_variant: 'express_summary' })
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('express_summary')
    expect(fetchSpy).not.toHaveBeenCalled()
    // No second exposure event either: the first page already reported it.
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('resolves to control when PostHog is down, and stays sticky on "in no experiment"', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network down'))
    const { getCheckoutVariant } = await freshModule()

    await expect(getCheckoutVariant()).resolves.toBe('control')
    // Cached deliberately, as the EMPTY map: retrying next page could land
    // express mid-journey, and stamping `control` on a visitor PostHog never
    // assigned would pad the control arm with un-randomised traffic.
    expect(cached()).toEqual({})
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('resolves to control on a non-ok response', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 500 }))
    const { getCheckoutVariant } = await freshModule()
    await expect(getCheckoutVariant()).resolves.toBe('control')
    expect(cached()).toEqual({})
  })

  it('folds a boolean flag payload to control instead of leaking it, and does not stamp it', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ checkout_variant: true }))
    const { getCheckoutVariant } = await freshModule()
    await expect(getCheckoutVariant()).resolves.toBe('control')
    expect(cached()).toEqual({})
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

describe('one decision for every registered experiment', () => {
  it('asks /decide once with the distinct id and resolves all four flags from it', async () => {
    fetchSpy.mockResolvedValue(
      decideResponse({
        checkout_variant: 'express_summary',
        home_hero: 'no_benefit_bar',
        cta_copy: 'invite',
        checkout_button_color: 'green',
      }),
    )
    const { getVariant, getCheckoutVariant } = await freshModule()

    await expect(getVariant(HOME_HERO_EXPERIMENT)).resolves.toBe('no_benefit_bar')
    await expect(getVariant(CTA_COPY_EXPERIMENT)).resolves.toBe('invite')
    await expect(getVariant(CHECKOUT_BUTTON_COLOR_EXPERIMENT)).resolves.toBe('green')
    await expect(getCheckoutVariant()).resolves.toBe('express_summary')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/decide\/\?v=3$/)
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: 'phc_test',
      distinct_id: 'browser-id-1',
    })
    expect(trackEvent).toHaveBeenCalledTimes(EXPERIMENTS.length)
    expect(trackEvent).toHaveBeenCalledWith('$feature_flag_called', {
      $feature_flag: 'home_hero',
      $feature_flag_response: 'no_benefit_bar',
    })
  })

  it('keeps the flags it is in and drops a key outside a flag list', async () => {
    fetchSpy.mockResolvedValue(
      decideResponse({
        home_hero: 'static_hero',
        cta_copy: 'shout', // deleted last sprint
        unrelated_flag: true,
      }),
    )
    const { getVariant } = await freshModule()

    await expect(getVariant(HOME_HERO_EXPERIMENT)).resolves.toBe('static_hero')
    await expect(getVariant(CTA_COPY_EXPERIMENT)).resolves.toBe('control')
    expect(cached()).toEqual({ home_hero: 'static_hero' })
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('exposes the decided map synchronously, and null before any decision', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ cta_copy: 'invite' }))
    const { decidedVariants, getExperimentVariants } = await freshModule()

    expect(decidedVariants()).toBeNull()
    await getExperimentVariants()
    expect(decidedVariants()).toEqual({ cta_copy: 'invite' })
  })

  it('reads a map another page of the session wrote, without a network call', async () => {
    cacheMap({ home_hero: 'static_hero' })
    const { decidedVariants, getVariant } = await freshModule()

    expect(decidedVariants()).toEqual({ home_hero: 'static_hero' })
    await expect(getVariant(HOME_HERO_EXPERIMENT)).resolves.toBe('static_hero')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('tells an emitter when there is nothing to wait for', async () => {
    const withoutConsent = await freshModule()
    clearConsent()
    expect(withoutConsent.whenVariantsDecided()).toBeNull()

    grantConsent()
    cacheMap({})
    const decided = await freshModule()
    expect(decided.whenVariantsDecided()).toBeNull()
  })

  it('hands an emitter the pending decision, and null once it landed', async () => {
    fetchSpy.mockResolvedValue(decideResponse({ home_hero: 'static_hero' }))
    const { whenVariantsDecided, decidedVariants } = await freshModule()

    const wait = whenVariantsDecided()
    expect(wait).not.toBeNull()
    await wait
    expect(decidedVariants()).toEqual({ home_hero: 'static_hero' })
    expect(whenVariantsDecided()).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('gives up after the 2s budget and treats the visitor as in no experiment', async () => {
    fetchSpy.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    vi.useFakeTimers()
    try {
      const { getVariant } = await freshModule()
      const decision = getVariant(HOME_HERO_EXPERIMENT)
      await vi.advanceTimersByTimeAsync(2_100)
      await expect(decision).resolves.toBe('control')
      expect(cached()).toEqual({})
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('assignedVariants', () => {
  it('folds a /decide payload to the registered flags this browser is in', async () => {
    const { assignedVariants } = await freshModule()
    expect(assignedVariants(undefined)).toEqual({})
    expect(assignedVariants({})).toEqual({})
    expect(
      assignedVariants({
        checkout_variant: 'control',
        home_hero: true,
        cta_copy: 'invite',
        checkout_button_color: 'blue',
      }),
    ).toEqual({ checkout_variant: 'control', cta_copy: 'invite' })
  })
})
