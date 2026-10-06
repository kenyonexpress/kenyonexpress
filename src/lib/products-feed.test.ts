import { describe, expect, it } from 'vitest'
import {
  PRODUCTS_MAX_LIMIT,
  PRODUCTS_PAGE_SIZE,
  parseProductsFeedQuery,
  shopHasMore,
} from './products-feed'

describe('parseProductsFeedQuery', () => {
  it('defaults to page 1, limit 20, and menu_order', () => {
    expect(parseProductsFeedQuery(new URLSearchParams())).toEqual({
      sort: 'menu_order',
      page: 1,
      limit: PRODUCTS_PAGE_SIZE,
      priceMin: undefined,
      priceMax: undefined,
      productType: undefined,
    })
  })

  it('accepts price_asc, price_desc and newest', () => {
    expect(parseProductsFeedQuery(new URLSearchParams('sort=price_asc')).sort).toBe('price_asc')
    expect(parseProductsFeedQuery(new URLSearchParams('sort=price_desc')).sort).toBe('price_desc')
    expect(parseProductsFeedQuery(new URLSearchParams('sort=newest')).sort).toBe('newest')
  })

  it('caps limit at 40 and rejects zero or negative page', () => {
    expect(parseProductsFeedQuery(new URLSearchParams('limit=99')).limit).toBe(PRODUCTS_MAX_LIMIT)
    expect(parseProductsFeedQuery(new URLSearchParams('page=0')).page).toBe(1)
    expect(parseProductsFeedQuery(new URLSearchParams('page=-3')).page).toBe(1)
  })

  it('reads price and type filters', () => {
    const q = parseProductsFeedQuery(new URLSearchParams('min=10&max=80&type=coupon'))
    expect(q.priceMin).toBe(10)
    expect(q.priceMax).toBe(80)
    expect(q.productType).toBe('coupon')
  })
})

describe('shopHasMore', () => {
  it('is true until the last full page is past', () => {
    expect(shopHasMore(1, 20, 44)).toBe(true)
    expect(shopHasMore(2, 20, 44)).toBe(true)
    expect(shopHasMore(3, 20, 44)).toBe(false)
    expect(shopHasMore(1, 20, 20)).toBe(false)
  })
})
