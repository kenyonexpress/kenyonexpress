import { describe, expect, it } from 'vitest'
import { PRODUCTS_PAGE_LIMIT, SCROLL_SKELETON_COUNT, parseProductsListQuery } from './list-query'

describe('parseProductsListQuery', () => {
  it('defaults to page 1, limit 20, and the archive order', () => {
    expect(parseProductsListQuery(new URLSearchParams())).toEqual({
      sort: 'menu_order',
      page: 1,
      limit: PRODUCTS_PAGE_LIMIT,
      min: undefined,
      max: undefined,
      type: undefined,
    })
    expect(PRODUCTS_PAGE_LIMIT).toBe(20)
    expect(SCROLL_SKELETON_COUNT).toBe(6)
  })

  it('accepts price_asc, price_desc, and newest', () => {
    for (const sort of ['price_asc', 'price_desc', 'newest'] as const) {
      expect(parseProductsListQuery(new URLSearchParams({ sort })).sort).toBe(sort)
    }
  })

  it('falls back on an unknown sort instead of filtering the catalogue away', () => {
    expect(parseProductsListQuery(new URLSearchParams({ sort: 'drop' })).sort).toBe('menu_order')
  })

  it('caps limit at 20 and rejects a non-positive page', () => {
    expect(parseProductsListQuery(new URLSearchParams({ limit: '100', page: '3' }))).toMatchObject({
      limit: 20,
      page: 3,
    })
    expect(parseProductsListQuery(new URLSearchParams({ limit: '0', page: '-4' }))).toMatchObject({
      limit: 20,
      page: 1,
    })
    expect(parseProductsListQuery(new URLSearchParams({ limit: '7' })).limit).toBe(7)
  })

  it('keeps a price filter and a product type, and drops garbage', () => {
    expect(
      parseProductsListQuery(new URLSearchParams({ min: '0', max: '100000', type: 'physical' })),
    ).toMatchObject({ min: 0, max: 100000, type: 'physical' })
    expect(
      parseProductsListQuery(new URLSearchParams({ min: '-1', max: 'nope', type: 'service' })),
    ).toMatchObject({ min: undefined, max: undefined, type: undefined })
  })
})
