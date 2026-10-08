/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHECKOUT_VARIANT_COOKIE,
  CHECKOUT_VARIANT_FLAG,
  CHECKOUT_VARIANT_PROPERTY,
  cacheCheckoutVariant,
  cachedCheckoutVariant,
  resolveCheckoutVariant,
} from './checkout-variant'
import { VARIANT_CACHE_KEY, readVariantCache } from './variant-cache'

afterEach(() => {
  window.sessionStorage.clear()
  document.cookie = `${CHECKOUT_VARIANT_COOKIE}=; Max-Age=0; Path=/`
})

describe('resolveCheckoutVariant', () => {
  it('passes known variants through and folds everything else to control', () => {
    expect(resolveCheckoutVariant('control')).toBe('control')
    expect(resolveCheckoutVariant('express_summary')).toBe('express_summary')
    // The shapes a misconfigured PostHog flag actually returns: a boolean for
    // an on/off flag, undefined for a missing key, a variant typo.
    expect(resolveCheckoutVariant(true)).toBe('control')
    expect(resolveCheckoutVariant(false)).toBe('control')
    expect(resolveCheckoutVariant(undefined)).toBe('control')
    expect(resolveCheckoutVariant('express-summary')).toBe('control')
    expect(resolveCheckoutVariant(null)).toBe('control')
  })
})

describe('the session cache', () => {
  it('is empty before any decision, not defaulted', () => {
    // null and 'control' mean different things to event stamping: null keeps
    // the property off events fired before the flag resolved.
    expect(cachedCheckoutVariant()).toBeNull()
  })

  it('round-trips a decision within the session, and mirrors it to the cookie', () => {
    cacheCheckoutVariant('express_summary')
    expect(cachedCheckoutVariant()).toBe('express_summary')
    expect(document.cookie).toContain(`${CHECKOUT_VARIANT_COOKIE}=express_summary`)
  })

  it('writes into the shared map beside other flags rather than over them', () => {
    // Since STEP 66 every experiment's decision lives in one sessionStorage
    // entry; the checkout writer must merge, or it would wipe the home page's.
    window.sessionStorage.setItem(VARIANT_CACHE_KEY, JSON.stringify({ home_hero: 'static_hero' }))
    cacheCheckoutVariant('express_summary')
    expect(readVariantCache()).toEqual({
      home_hero: 'static_hero',
      [CHECKOUT_VARIANT_FLAG]: 'express_summary',
    })
  })

  it('reads a decided session the flag is not in as control', () => {
    window.sessionStorage.setItem(VARIANT_CACHE_KEY, JSON.stringify({}))
    expect(cachedCheckoutVariant()).toBe('control')
  })

  it('resolves a stale or tampered cache entry to control, never to garbage', () => {
    window.sessionStorage.setItem(
      VARIANT_CACHE_KEY,
      JSON.stringify({ [CHECKOUT_VARIANT_FLAG]: 'variant_deleted_last_sprint' }),
    )
    expect(cachedCheckoutVariant()).toBe('control')
  })
})

describe('the PostHog contract', () => {
  it('derives the experiment property from the flag key, the way PostHog reads it', () => {
    expect(CHECKOUT_VARIANT_PROPERTY).toBe(`$feature/${CHECKOUT_VARIANT_FLAG}`)
  })
})
