import { describe, expect, it } from 'vitest'
import { type CompareProduct, cheapestId, toCompareColumn } from './rows'

const product = (over: Partial<CompareProduct>): CompareProduct => ({
  id: 'p',
  slug: 'p',
  name_he: 'מוצר',
  kenyon_price: 100,
  full_price: 400,
  images: ['a.jpg'],
  stock_quantity: null,
  short_description_he: null,
  coupon_expiry_days: null,
  category: null,
  ...over,
})

describe('toCompareColumn', () => {
  it('derives the saving and the discount from the two prices, in agorot', () => {
    const column = toCompareColumn(product({ kenyon_price: '99.90', full_price: 150 }))
    expect(column.priceAgorot).toBe(9990)
    expect(column.fullPriceAgorot).toBe(15000)
    expect(column.savingAgorot).toBe(5010)
    expect(column.discountPercent).toBe(33)
  })

  it('claims no saving when the product is not cheaper than its full price', () => {
    for (const full of [100, 80, null]) {
      const column = toCompareColumn(product({ kenyon_price: 100, full_price: full }))
      expect(column.fullPriceAgorot).toBeNull()
      expect(column.savingAgorot).toBeNull()
      expect(column.discountPercent).toBeNull()
    }
  })

  it('has no price for a missing, zero or unreadable one', () => {
    expect(toCompareColumn(product({ kenyon_price: null })).priceAgorot).toBeNull()
    expect(toCompareColumn(product({ kenyon_price: 0 })).priceAgorot).toBeNull()
    expect(toCompareColumn(product({ kenyon_price: 'abc' })).priceAgorot).toBeNull()
  })

  it('reads untracked stock as in stock and zero as sold out', () => {
    expect(toCompareColumn(product({ stock_quantity: null })).inStock).toBe(true)
    expect(toCompareColumn(product({ stock_quantity: 3 })).inStock).toBe(true)
    expect(toCompareColumn(product({ stock_quantity: 0 })).inStock).toBe(false)
  })

  it('keeps a voucher life only when it is a positive whole number of days', () => {
    expect(toCompareColumn(product({ coupon_expiry_days: 30 })).voucherDays).toBe(30)
    expect(toCompareColumn(product({ coupon_expiry_days: 0 })).voucherDays).toBeNull()
    expect(toCompareColumn(product({ coupon_expiry_days: 1.5 })).voucherDays).toBeNull()
  })

  it('takes the first image and trims an empty description to nothing', () => {
    expect(toCompareColumn(product({ images: null })).image).toBeNull()
    expect(toCompareColumn(product({ short_description_he: '   ' })).description).toBeNull()
  })
})

describe('cheapestId', () => {
  const col = (id: string, price: number | null) =>
    toCompareColumn(product({ id, kenyon_price: price, full_price: null }))

  it('names the one lowest price', () => {
    expect(cheapestId([col('a', 100), col('b', 40), col('c', 90)])).toBe('b')
  })

  it('names nobody on a tie, with one priced product, or with none', () => {
    expect(cheapestId([col('a', 40), col('b', 40), col('c', 90)])).toBeNull()
    expect(cheapestId([col('a', 40), col('b', null)])).toBeNull()
    expect(cheapestId([])).toBeNull()
  })
})
