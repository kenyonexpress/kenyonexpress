import { describe, expect, it } from 'vitest'
import {
  CHECKOUT_VARIANTS,
  CHECKOUT_VARIANT_FLAG,
  CHECKOUT_VARIANT_PROPERTY,
} from './checkout-variant'
import { CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES } from './events'
import { EXPERIMENTS, experimentByKey, resolveVariant } from './experiments'

/**
 * The registry is strings all the way down, and nothing but this test ties
 * them to the modules that emit them. A renamed flag, a variant added to the
 * checkout but not here, or a goal event nobody emits would each leave an
 * experiments page that reports zeros forever with no error.
 */
describe('experiment registry', () => {
  it('has unique keys', () => {
    const keys = EXPERIMENTS.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('locks the checkout experiment to the constants checkout-variant.ts owns', () => {
    const checkout = experimentByKey(CHECKOUT_VARIANT_FLAG)
    expect(checkout).not.toBeNull()
    expect(checkout?.flag).toBe(CHECKOUT_VARIANT_FLAG)
    expect(checkout?.property).toBe(CHECKOUT_VARIANT_PROPERTY)
    expect(checkout?.variants).toEqual(CHECKOUT_VARIANTS)
    expect(checkout?.variants).toContain(checkout?.control)
  })

  it('names only events the taxonomy actually carries', () => {
    for (const experiment of EXPERIMENTS) {
      for (const event of experiment.exposureEvents) {
        expect(CLIENT_EVENT_NAMES).toContain(event)
      }
      expect(SERVER_EVENT_NAMES).toContain(experiment.goalEvent)
    }
  })

  it('labels every variant in Hebrew', () => {
    for (const experiment of EXPERIMENTS) {
      for (const variant of experiment.variants) {
        expect(experiment.variantLabelsHe[variant]).toBeTruthy()
      }
    }
  })

  it('resolves unknown or non-string payloads to control', () => {
    const checkout = experimentByKey(CHECKOUT_VARIANT_FLAG)
    if (!checkout) throw new Error('missing')
    expect(resolveVariant(checkout, 'express_summary')).toBe('express_summary')
    expect(resolveVariant(checkout, 'typo')).toBe('control')
    expect(resolveVariant(checkout, true)).toBe('control')
    expect(resolveVariant(checkout, undefined)).toBe('control')
  })

  it('returns null for an unknown key', () => {
    expect(experimentByKey('nope')).toBeNull()
  })
})
