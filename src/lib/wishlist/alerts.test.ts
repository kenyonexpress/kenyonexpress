import { agorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import {
  PRICE_DROP_MIN_AGOROT,
  PRICE_DROP_MIN_BP,
  backInStockDedupeKey,
  priceDropDedupeKey,
  priceDropVerdict,
} from './alerts'

describe('a price drop worth mailing about', () => {
  it('alerts on a real drop', () => {
    const verdict = priceDropVerdict({ savedAtAgorot: agorot(20_000), nowAgorot: agorot(15_000) })
    expect(verdict).toEqual({
      alert: true,
      savedAgorot: 20_000,
      nowAgorot: 15_000,
      dropAgorot: 5_000,
      dropBp: 2_500,
    })
  })

  it('needs BOTH bounds, not either', () => {
    // A percentage alone is wrong at the bottom of the catalogue: 10% off a ₪20
    // product is ₪2, and a mail about ₪2 teaches somebody to ignore us.
    expect(priceDropVerdict({ savedAtAgorot: agorot(2_000), nowAgorot: agorot(1_800) })).toEqual({
      alert: false,
      reason: 'too_small',
    })
    // An absolute alone is wrong at the top: ₪5 off a ₪1,600 campaign is not
    // news either.
    expect(
      priceDropVerdict({ savedAtAgorot: agorot(160_000), nowAgorot: agorot(159_500) }),
    ).toEqual({ alert: false, reason: 'too_small' })
  })

  it('takes the thresholds exactly, not approximately', () => {
    // 5% of ₪100 is ₪5, which is exactly both minima at once.
    const exact = priceDropVerdict({ savedAtAgorot: agorot(10_000), nowAgorot: agorot(9_500) })
    expect(exact.alert).toBe(true)
    expect(exact.alert && exact.dropBp).toBe(PRICE_DROP_MIN_BP)
    expect(exact.alert && exact.dropAgorot).toBe(PRICE_DROP_MIN_AGOROT)

    // One agora less on either measure and it is refused.
    expect(priceDropVerdict({ savedAtAgorot: agorot(10_000), nowAgorot: agorot(9_501) })).toEqual({
      alert: false,
      reason: 'too_small',
    })
  })

  it('floors the basis points, so a drop cannot round its way past the bar', () => {
    // 499.9bp floors to 499 and is refused, rather than rounding to 500.
    const verdict = priceDropVerdict({ savedAtAgorot: agorot(100_001), nowAgorot: agorot(95_002) })
    expect(verdict).toEqual({ alert: false, reason: 'too_small' })
  })

  it('says nothing about a price that went up or stayed still', () => {
    expect(priceDropVerdict({ savedAtAgorot: agorot(10_000), nowAgorot: agorot(10_000) })).toEqual({
      alert: false,
      reason: 'not_cheaper',
    })
    expect(priceDropVerdict({ savedAtAgorot: agorot(10_000), nowAgorot: agorot(12_000) })).toEqual({
      alert: false,
      reason: 'not_cheaper',
    })
  })

  it('refuses to invent a baseline when none was recorded', () => {
    // `price_history` starts the day 193 is applied, so a product saved before
    // that has no recorded price. Falling back to today's would compare a
    // number with itself; falling back to `full_price` would compare against a
    // claim CLAUDE.md blocker #1 says nobody can evidence.
    expect(priceDropVerdict({ savedAtAgorot: null, nowAgorot: agorot(9_900) })).toEqual({
      alert: false,
      reason: 'no_history',
    })
    expect(priceDropVerdict({ savedAtAgorot: agorot(0), nowAgorot: agorot(9_900) })).toEqual({
      alert: false,
      reason: 'no_history',
    })
  })
})

describe('the dedupe keys', () => {
  it('keys a price drop on the NEW price, not the day', () => {
    // A product that sits at the lower price for a month must produce one mail,
    // not thirty -- so no date. A product that drops AGAIN must produce a second
    // mail -- so not just the pair.
    const first = priceDropDedupeKey('u1', 'p1', 9_500)
    expect(priceDropDedupeKey('u1', 'p1', 9_500)).toBe(first)
    expect(priceDropDedupeKey('u1', 'p1', 8_000)).not.toBe(first)
    expect(priceDropDedupeKey('u2', 'p1', 9_500)).not.toBe(first)
  })

  it('keys back-in-stock on the waitlist row, not the product', () => {
    // `stock_waitlist` already enforces one live request per address per
    // product and marks a row notified when it is mailed, so a person who asks
    // again after a later restock is told again -- which is what asking again
    // means.
    expect(backInStockDedupeKey('row-1')).not.toBe(backInStockDedupeKey('row-2'))
  })
})
