import { describe, expect, it } from 'vitest'
import {
  backInStockDedupeKey,
  detectPriceDrop,
  isInStock,
  isoWeekKey,
  previousObservedPrice,
  priceDropDedupeKey,
} from './alerts'

describe('previousObservedPrice', () => {
  it('takes the lowest price of the most recent day before today', () => {
    // 193 allows several rows per day and instructs the reader to take the
    // lowest, the price a shopper could actually have paid.
    const rows = [
      { observed_on: '2026-09-08', price_agorot: 40000 },
      { observed_on: '2026-09-09', price_agorot: 35000 },
      { observed_on: '2026-09-09', price_agorot: 32000 },
      { observed_on: '2026-09-10', price_agorot: 29900 },
    ]
    expect(previousObservedPrice(rows, '2026-09-10')).toBe(32000)
  })

  it('ignores rows filed under today, whatever order they arrive in', () => {
    const rows = [
      { observed_on: '2026-09-10', price_agorot: 100 },
      { observed_on: '2026-09-01', price_agorot: 500 },
    ]
    expect(previousObservedPrice(rows, '2026-09-10')).toBe(500)
  })

  it('answers null on the first day a product is ever observed', () => {
    expect(
      previousObservedPrice([{ observed_on: '2026-09-10', price_agorot: 100 }], '2026-09-10'),
    ).toBeNull()
    expect(previousObservedPrice([], '2026-09-10')).toBeNull()
  })
})

describe('detectPriceDrop', () => {
  it('reports a genuine drop with both integers intact', () => {
    expect(detectPriceDrop(40000, 29900)).toEqual({ oldAgorot: 40000, newAgorot: 29900 })
  })

  it('stays silent on a rise, a flat price, a free product and a missing baseline', () => {
    expect(detectPriceDrop(100, 200)).toBeNull()
    expect(detectPriceDrop(100, 100)).toBeNull()
    expect(detectPriceDrop(100, 0)).toBeNull()
    expect(detectPriceDrop(null, 50)).toBeNull()
    expect(detectPriceDrop(0, 50)).toBeNull()
    expect(detectPriceDrop(100, null)).toBeNull()
  })
})

describe('isInStock', () => {
  it('treats untracked inventory as available and zero as sold out', () => {
    expect(isInStock(null, 'active')).toBe(true)
    expect(isInStock(5, 'active')).toBe(true)
    expect(isInStock(0, 'active')).toBe(false)
  })

  it('never counts a non-active product as in stock', () => {
    expect(isInStock(5, 'draft')).toBe(false)
    expect(isInStock(null, null)).toBe(false)
  })
})

describe('the dedupe keys', () => {
  it('mail each price floor once and each restock day once', () => {
    expect(priceDropDedupeKey('u1', 'p1', 29900)).toBe('price_drop:u1:p1:29900')
    expect(backInStockDedupeKey('u1', 'p1', '2026-09-10')).toBe('back_in_stock:u1:p1:2026-09-10')
  })
})

describe('isoWeekKey', () => {
  it('matches ISO 8601, including the year boundary', () => {
    expect(isoWeekKey(new Date('2026-09-11T04:00:00Z'))).toBe('2026-W37')
    // 2027-01-01 is a Friday, so it belongs to 2026's last week, W53.
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    expect(isoWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01')
  })
})
