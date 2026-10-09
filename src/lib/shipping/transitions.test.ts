import { describe, expect, it } from 'vitest'
import { planTransition } from './transitions'

const base = { productType: 'physical', orderStatus: 'paid' } as const

describe('planTransition', () => {
  it('ships a pending physical line on a paid order', () => {
    expect(planTransition({ ...base, verb: 'ship', itemStatus: 'pending' })).toEqual({
      ok: true,
      nextStatus: 'shipped',
    })
  })

  it('delivers only from shipped', () => {
    expect(planTransition({ ...base, verb: 'deliver', itemStatus: 'shipped' })).toEqual({
      ok: true,
      nextStatus: 'delivered',
    })
    for (const itemStatus of ['pending', 'delivered', 'issued', 'cancelled', 'refunded'] as const) {
      expect(planTransition({ ...base, verb: 'deliver', itemStatus }).ok).toBe(false)
    }
  })

  it('never ships twice, never ships terminal states', () => {
    for (const itemStatus of ['shipped', 'delivered', 'issued', 'cancelled', 'refunded'] as const) {
      expect(planTransition({ ...base, verb: 'ship', itemStatus }).ok).toBe(false)
    }
  })

  it('refuses coupon lines -- redemption is the coupon machine', () => {
    expect(
      planTransition({
        verb: 'ship',
        productType: 'coupon',
        itemStatus: 'pending',
        orderStatus: 'paid',
      }).ok,
    ).toBe(false)
  })

  it('refuses unpaid, cancelled and refunded orders', () => {
    for (const orderStatus of ['pending', 'cancelled', 'refunded']) {
      expect(
        planTransition({
          verb: 'ship',
          productType: 'physical',
          itemStatus: 'pending',
          orderStatus,
        }).ok,
      ).toBe(false)
    }
    for (const orderStatus of ['paid', 'partially_fulfilled', 'fulfilled', 'platform_settled']) {
      expect(
        planTransition({
          verb: 'ship',
          productType: 'physical',
          itemStatus: 'pending',
          orderStatus,
        }).ok,
      ).toBe(true)
    }
  })
})
