import { describe, expect, it } from 'vitest'
import { CASHBACK_TIER_PROPERTY } from './cashback-tier'
import { CHECKOUT_VARIANT_PROPERTY } from './checkout-variant'
import type { GaEventName } from './ecommerce'
import { SERVER_EVENT_NAMES } from './events'
import {
  COHORT_PERSON_PROPERTIES,
  PURCHASE_FUNNEL,
  purchaseFunnelEventNames,
} from './posthog-funnel'

/**
 * The taxonomy is documentation-as-code, and documentation drifts unless it is
 * executable. Every name in the funnel is locked here to the module that
 * actually emits it, so a rename upstream fails the build instead of quietly
 * zeroing a dashboard someone configured months ago.
 */
describe('the purchase funnel taxonomy', () => {
  it('lists the steps in journey order', () => {
    expect(purchaseFunnelEventNames()).toEqual([
      '$pageview',
      'view_item',
      'add_to_cart',
      'begin_checkout',
      'purchase',
    ])
  })

  it('uses only names the emitters can produce', () => {
    // The GA-named browser events all come from trackCommerce; assignment to
    // GaEventName is the compile-time lock, membership is the runtime one.
    const clientNames: GaEventName[] = ['view_item', 'add_to_cart', 'begin_checkout']
    for (const name of clientNames) {
      expect(purchaseFunnelEventNames()).toContain(name)
    }
    // The conversion comes from trackServerEvent's taxonomy and nowhere else.
    expect(SERVER_EVENT_NAMES).toContain('purchase')
  })

  it('ends at purchase, the only step that says money moved', () => {
    expect(PURCHASE_FUNNEL[PURCHASE_FUNNEL.length - 1]?.event).toBe('purchase')
    expect(PURCHASE_FUNNEL[PURCHASE_FUNNEL.length - 1]?.origin).toBe('server')
  })

  it('offers the experiment property as a breakdown where the experiment runs', () => {
    const beginCheckout = PURCHASE_FUNNEL.find((step) => step.event === 'begin_checkout')
    expect(beginCheckout?.breakdowns).toContain(CHECKOUT_VARIANT_PROPERTY)
  })

  it('locks the cohort person properties to the module that writes them', () => {
    expect(COHORT_PERSON_PROPERTIES).toContain(CASHBACK_TIER_PROPERTY)
  })
})
