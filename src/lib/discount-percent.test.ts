import { describe, expect, it } from 'vitest'
import {
  DISCOUNT_STEPS,
  discountPercent,
  meetsMinDiscount,
  parseMinDiscount,
} from './discount-percent'

describe('discountPercent', () => {
  it('rounds the saving between the two prices to a whole percent', () => {
    expect(discountPercent(600, 675)).toBe(11)
    expect(discountPercent(800, 1000)).toBe(20)
    expect(discountPercent(99, 195)).toBe(49)
    expect(discountPercent(250, 500)).toBe(50)
  })

  it('is zero when there is no saving to show', () => {
    expect(discountPercent(100, 100)).toBe(0)
    expect(discountPercent(120, 100)).toBe(0)
    expect(discountPercent(50, 0)).toBe(0)
    expect(discountPercent(-1, 100)).toBe(0)
    expect(discountPercent(Number.NaN, 100)).toBe(0)
  })
})

describe('parseMinDiscount', () => {
  it('accepts a whole percent from 1 to 99', () => {
    expect(parseMinDiscount('10')).toBe(10)
    expect(parseMinDiscount('25')).toBe(25)
    expect(parseMinDiscount('99')).toBe(99)
    expect(parseMinDiscount(['30', '50'])).toBe(30)
  })

  it('treats 0, 100 and anything that is not a whole number as no filter', () => {
    for (const raw of ['0', '100', '150', '-5', '10.5', '1e1', 'abc', '', undefined]) {
      expect(parseMinDiscount(raw), String(raw)).toBeUndefined()
    }
  })

  it('offers the four steps the sidebar lists, ascending', () => {
    expect([...DISCOUNT_STEPS]).toEqual([10, 20, 30, 50])
  })
})

describe('meetsMinDiscount', () => {
  it('reads the same two columns the card badge reads, as PostgREST returns them', () => {
    // numeric columns arrive as strings over REST
    expect(meetsMinDiscount({ kenyon_price: '800.00', full_price: '1000.00' }, 20)).toBe(true)
    expect(meetsMinDiscount({ kenyon_price: '800.00', full_price: '1000.00' }, 21)).toBe(false)
    expect(meetsMinDiscount({ kenyon_price: 99, full_price: 150 }, 30)).toBe(true)
  })

  it('never matches a product with no badge', () => {
    expect(meetsMinDiscount({ kenyon_price: 99, full_price: null }, 1)).toBe(false)
    expect(meetsMinDiscount({ kenyon_price: null, full_price: 150 }, 1)).toBe(false)
    expect(meetsMinDiscount({ kenyon_price: 150, full_price: 150 }, 1)).toBe(false)
    expect(meetsMinDiscount({ kenyon_price: 'x', full_price: 150 }, 1)).toBe(false)
  })
})
