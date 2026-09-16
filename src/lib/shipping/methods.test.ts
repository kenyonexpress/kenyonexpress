import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHIPPING_METHOD_ID,
  SHIPPING_METHODS,
  isShippingMethodId,
  resolveShippingMethod,
} from './methods'

/**
 * The registry is what the cookie is validated against, so what matters is
 * what it does with a value it does not know, and what every rate is while
 * `orders` has no column to record one.
 */
describe('shipping methods registry', () => {
  it('lists the default first, so a fresh cart reads as already chosen', () => {
    expect(SHIPPING_METHODS[0]?.id).toBe(DEFAULT_SHIPPING_METHOD_ID)
  })

  it('has no duplicate ids and a Hebrew label on every entry', () => {
    const ids = SHIPPING_METHODS.map((method) => method.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const method of SHIPPING_METHODS) {
      expect(method.label).toMatch(/[֐-׿]/)
      expect(method.description).toMatch(/[֐-׿]/)
    }
  })

  it('accepts every registered id and nothing else', () => {
    for (const method of SHIPPING_METHODS) expect(isShippingMethodId(method.id)).toBe(true)
    expect(isShippingMethodId('express')).toBe(false)
    expect(isShippingMethodId('')).toBe(false)
    expect(isShippingMethodId(undefined)).toBe(false)
    expect(isShippingMethodId(42)).toBe(false)
    expect(isShippingMethodId({ id: 'pickup' })).toBe(false)
  })

  it('resolves a known id to its own entry', () => {
    expect(resolveShippingMethod('pickup').id).toBe('pickup')
    expect(resolveShippingMethod('pickup').label).toBe('איסוף עצמי מהספק')
  })

  it('resolves an absent, stale or edited cookie to the default rather than failing', () => {
    expect(resolveShippingMethod(undefined).id).toBe(DEFAULT_SHIPPING_METHOD_ID)
    expect(resolveShippingMethod('').id).toBe(DEFAULT_SHIPPING_METHOD_ID)
    expect(resolveShippingMethod('renamed_method').id).toBe(DEFAULT_SHIPPING_METHOD_ID)
    expect(resolveShippingMethod('PICKUP').id).toBe(DEFAULT_SHIPPING_METHOD_ID)
  })

  /**
   * THE PIN. `orders` has no shipping money column in production
   * (migrations/pending/236_orders_shipping_method.sql is unapplied) and the
   * settlement engine does not add shipping to the card charge. A non-zero
   * rate here would make the cart total and the charged amount disagree, which
   * is the one disagreement this repo keeps paying for. Turning a rate on is a
   * three-part change: apply 236, teach `calculateSettlement` the line, and
   * only then delete this test.
   */
  it('charges nothing for every method until orders can record a rate', () => {
    for (const method of SHIPPING_METHODS) {
      expect(method.costAgorot).toBe(0)
      expect(Number.isInteger(method.costAgorot)).toBe(true)
    }
  })
})
