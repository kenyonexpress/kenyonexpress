/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHECKOUT_VARIANT_CACHE_KEY,
  CHECKOUT_VARIANT_FLAG,
  CHECKOUT_VARIANT_PROPERTY,
  cacheCheckoutVariant,
  cachedCheckoutVariant,
  resolveCheckoutVariant,
} from './checkout-variant'

afterEach(() => {
  window.sessionStorage.clear()
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

  it('round-trips a decision within the session', () => {
    cacheCheckoutVariant('express_summary')
    expect(cachedCheckoutVariant()).toBe('express_summary')
  })

  it('resolves a stale or tampered cache entry to control, never to garbage', () => {
    window.sessionStorage.setItem(CHECKOUT_VARIANT_CACHE_KEY, 'variant_deleted_last_sprint')
    expect(cachedCheckoutVariant()).toBe('control')
  })
})

describe('the PostHog contract', () => {
  it('derives the experiment property from the flag key, the way PostHog reads it', () => {
    expect(CHECKOUT_VARIANT_PROPERTY).toBe(`$feature/${CHECKOUT_VARIANT_FLAG}`)
  })
})
