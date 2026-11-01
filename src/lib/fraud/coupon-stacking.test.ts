import { describe, expect, it } from 'vitest'
import { couponStackingViolations } from './coupon-stacking'

describe('couponStackingViolations', () => {
  it('is silent when no discount code applied, whatever the other numbers say', () => {
    expect(
      couponStackingViolations({
        discountAgorot: 0,
        walletAppliedAgorot: 10000,
        cardChargeAgorot: 0,
        cashbackAgorot: 5000,
      }),
    ).toEqual([])
  })

  it('is silent on the ordinary discounted order: card pays more than the cashback minted', () => {
    expect(
      couponStackingViolations({
        discountAgorot: 2000,
        walletAppliedAgorot: 0,
        cardChargeAgorot: 8000,
        cashbackAgorot: 500,
      }),
    ).toEqual([])
  })

  it('flags the extraction loop: coupon plus wallet leave the card paying less than the cashback minted', () => {
    expect(
      couponStackingViolations({
        discountAgorot: 3000,
        walletAppliedAgorot: 6500,
        cardChargeAgorot: 500,
        cashbackAgorot: 1000,
      }),
    ).toEqual(['cashback-exceeds-card-charge'])
  })

  it('flags a code applied to an order the card never sees, and the loop on top when cashback mints', () => {
    expect(
      couponStackingViolations({
        discountAgorot: 3000,
        walletAppliedAgorot: 7000,
        cardChargeAgorot: 0,
        cashbackAgorot: 1000,
      }),
    ).toEqual(['discount-with-zero-card-charge', 'cashback-exceeds-card-charge'])
  })

  it('does not call zero cashback a loop on a fully covered order', () => {
    expect(
      couponStackingViolations({
        discountAgorot: 3000,
        walletAppliedAgorot: 7000,
        cardChargeAgorot: 0,
        cashbackAgorot: 0,
      }),
    ).toEqual(['discount-with-zero-card-charge'])
  })
})
