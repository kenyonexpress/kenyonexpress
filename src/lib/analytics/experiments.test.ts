import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHECKOUT_VARIANTS,
  CHECKOUT_VARIANT_FLAG,
  CHECKOUT_VARIANT_PROPERTY,
} from './checkout-variant'
import { CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES } from './events'
import {
  CHECKOUT_BUTTON_COLOR_EXPERIMENT,
  CTA_COPY_EXPERIMENT,
  EXPERIMENTS,
  HOME_HERO_EXPERIMENT,
  experimentByKey,
  resolveVariant,
} from './experiments'

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

  it('registers the three STEP 66 experiments, multivariate with control first', () => {
    expect(EXPERIMENTS).toHaveLength(4)
    for (const experiment of [
      HOME_HERO_EXPERIMENT,
      CTA_COPY_EXPERIMENT,
      CHECKOUT_BUTTON_COLOR_EXPERIMENT,
    ]) {
      expect(experimentByKey(experiment.key)).toBe(experiment)
      expect(experiment.flag).toBe(experiment.key)
      expect(experiment.variants[0]).toBe('control')
      expect(experiment.control).toBe('control')
      expect(experiment.variants.length).toBeGreaterThanOrEqual(2)
      expect(new Set(experiment.variants).size).toBe(experiment.variants.length)
      // The property PostHog's experiment analysis reads natively.
      expect(experiment.property).toBe(`$feature/${experiment.flag}`)
      expect(experiment.goalEvent).toBe('purchase')
    }
  })

  it('narrows the homepage exposure to the route the provider stamps on page_view', () => {
    // The home experiment's exposure is a page_view; without the filter the
    // report would count every page of the month as a homepage exposure.
    expect(HOME_HERO_EXPERIMENT.exposureEvents).toEqual(['page_view'])
    expect(HOME_HERO_EXPERIMENT.exposureFilter).toEqual({ prop: 'route', value: '/' })
    const provider = readFileSync(
      resolve(process.cwd(), 'src/components/analytics/AnalyticsProvider.tsx'),
      'utf8',
    )
    expect(provider).toMatch(/track\('page_view', \{ route: routeTemplate\(pathname\)/)
  })

  it('exposes the two checkout experiments on the same step event the form emits', () => {
    expect(CHECKOUT_BUTTON_COLOR_EXPERIMENT.exposureEvents).toEqual(['checkout_step'])
    expect(CTA_COPY_EXPERIMENT.exposureEvents).toEqual(['view_product'])
    for (const experiment of EXPERIMENTS) {
      if (experiment.exposureFilter) continue
      expect(experiment.exposureEvents, experiment.key).not.toContain('page_view')
    }
  })

  it('keys every flag the way PostHog accepts: lowercase with underscores', () => {
    for (const experiment of EXPERIMENTS) {
      expect(experiment.flag).toMatch(/^[a-z][a-z0-9_]*$/)
      for (const variant of experiment.variants) expect(variant).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })
})
