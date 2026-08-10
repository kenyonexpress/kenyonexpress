import { describe, expect, it } from 'vitest'
import { mapType } from './clean.mjs'

// The category sets are empty in `config.mjs` and deliberately so: no category
// in the export has been designated a coupon or a service category yet. Passing
// the real shape rather than a convenient one keeps these tests honest about
// what the pipeline actually runs with.
const DEFAULTS = { couponCategorySlugs: [], serviceCategorySlugs: [] }

describe('mapType', () => {
  it('falls to physical when nothing says otherwise', () => {
    expect(mapType(['hot-deals'], DEFAULTS, {}, 'simple')).toBe('physical')
  })

  it('reads the explicit coupon meta', () => {
    expect(mapType([], DEFAULTS, { _is_coupon: 'yes' }, 'simple')).toBe('coupon')
  })

  it('reads the configured category sets', () => {
    const sets = { couponCategorySlugs: ['vouchers'], serviceCategorySlugs: ['treatments'] }
    expect(mapType(['vouchers'], sets, {}, 'simple')).toBe('coupon')
    expect(mapType(['treatments'], sets, {}, 'simple')).toBe('service')
  })

  // The reason this branch exists at all. A WooCommerce Subscriptions row has a
  // title, a price and an image, so every gate in emit-missing-products.mjs
  // passes it; without this it lands as `physical` and a monthly subscription
  // gets sold once, as a boxed item.
  it('maps a WooCommerce subscription to recurring, not physical', () => {
    expect(mapType(['hot-deals'], DEFAULTS, {}, 'subscription')).toBe('recurring')
    expect(mapType(['hot-deals'], DEFAULTS, {}, 'variable-subscription')).toBe('recurring')
    expect(mapType(['hot-deals'], DEFAULTS, {}, 'SUBSCRIPTION')).toBe('recurring')
  })

  it('catches a subscription that only left its meta behind', () => {
    // A variable-subscription parent keeps the price on its variations, and a
    // half-migrated extension leaves the meta on a row typed `simple`. Either
    // signal alone is enough.
    expect(mapType([], DEFAULTS, { _subscription_price: '49.90' }, 'simple')).toBe('recurring')
    expect(mapType([], DEFAULTS, { _subscription_period: 'month' }, 'simple')).toBe('recurring')
  })

  it('does not read an empty meta value as a subscription', () => {
    // WordPress writes '' for a meta key it once had and no longer uses. Reading
    // presence rather than truth would turn every such row into a recurring
    // charge.
    expect(mapType([], DEFAULTS, { _subscription_price: '' }, 'simple')).toBe('physical')
  })

  it('lets recurring win over the coupon rules', () => {
    // Being wrong here charges a card on a schedule; being wrong the other way
    // issues one voucher. The expensive mistake gets the earlier check.
    expect(
      mapType(['vouchers'], { ...DEFAULTS, couponCategorySlugs: ['vouchers'] }, {}, 'subscription'),
    ).toBe('recurring')
    expect(mapType([], DEFAULTS, { _is_coupon: 'yes', _subscription_price: '20' }, 'simple')).toBe(
      'recurring',
    )
  })

  it('survives a missing woo type', () => {
    // 01-extract does not always populate it, and `String(null)` is 'null'.
    expect(mapType(['x'], DEFAULTS, {})).toBe('physical')
    expect(mapType(['x'], DEFAULTS, {}, null)).toBe('physical')
  })
})
