import { describe, expect, it } from 'vitest'
import {
  type CategoryFilterChips,
  type CategoryFilterable,
  NO_FILTERS,
  anyFilter,
  matchesCategoryFilters,
  parseCategoryFilterChips,
  toggleFilterChipHref,
} from './category-filter-chips'

describe('parseCategoryFilterChips', () => {
  it('returns NO_FILTERS when filters param is absent', () => {
    expect(parseCategoryFilterChips({})).toEqual(NO_FILTERS)
    expect(parseCategoryFilterChips(new URLSearchParams())).toEqual(NO_FILTERS)
  })

  it('parses single filter from comma-separated string', () => {
    const params = new URLSearchParams('filters=weekend')
    expect(parseCategoryFilterChips(params)).toEqual({
      weekend: true,
      freeShipping: false,
      price100: false,
      price500: false,
    })
  })

  it('parses multiple filters from comma-separated string', () => {
    const params = new URLSearchParams('filters=weekend,free_shipping,price_100')
    expect(parseCategoryFilterChips(params)).toEqual({
      weekend: true,
      freeShipping: true,
      price100: true,
      price500: false,
    })
  })

  it('parses all four filters', () => {
    const params = new URLSearchParams('filters=weekend,free_shipping,price_100,price_500')
    expect(parseCategoryFilterChips(params)).toEqual({
      weekend: true,
      freeShipping: true,
      price100: true,
      price500: true,
    })
  })

  it('ignores unknown filter keys', () => {
    const params = new URLSearchParams('filters=weekend,unknown,free_shipping')
    expect(parseCategoryFilterChips(params)).toEqual({
      weekend: true,
      freeShipping: true,
      price100: false,
      price500: false,
    })
  })

  it('works with Record<string, string> params', () => {
    expect(parseCategoryFilterChips({ filters: 'weekend,price_100' })).toEqual({
      weekend: true,
      freeShipping: false,
      price100: true,
      price500: false,
    })
  })
})

describe('anyFilter', () => {
  it('returns false for NO_FILTERS', () => {
    expect(anyFilter(NO_FILTERS)).toBe(false)
  })

  it('returns true when weekend is on', () => {
    expect(anyFilter({ ...NO_FILTERS, weekend: true })).toBe(true)
  })

  it('returns true when any filter is on', () => {
    expect(anyFilter({ ...NO_FILTERS, freeShipping: true })).toBe(true)
    expect(anyFilter({ ...NO_FILTERS, price100: true })).toBe(true)
    expect(anyFilter({ ...NO_FILTERS, price500: true })).toBe(true)
  })
})

describe('matchesCategoryFilters', () => {
  const baseProduct: CategoryFilterable = {
    supplier: { open_weekends: false },
    shipping_price_agorot: 1000,
    kenyon_price: 150, // in shekels
  }

  it('matches everything when all filters are off', () => {
    expect(matchesCategoryFilters(baseProduct, NO_FILTERS)).toBe(true)
  })

  describe('weekend filter', () => {
    it('matches when supplier.open_weekends is true and filter is on', () => {
      const product = { ...baseProduct, supplier: { open_weekends: true } }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, weekend: true })).toBe(true)
    })

    it('rejects when supplier.open_weekends is false and filter is on', () => {
      const product = { ...baseProduct, supplier: { open_weekends: false } }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, weekend: true })).toBe(false)
    })

    it('rejects when supplier.open_weekends is null and filter is on', () => {
      const product = { ...baseProduct, supplier: { open_weekends: null } }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, weekend: true })).toBe(false)
    })

    it('rejects when supplier is null and filter is on', () => {
      const product = { ...baseProduct, supplier: null }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, weekend: true })).toBe(false)
    })

    it('matches when filter is off regardless of value', () => {
      const product = { ...baseProduct, supplier: { open_weekends: false } }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, weekend: false })).toBe(true)
    })
  })

  describe('free shipping filter', () => {
    it('matches when shipping_price_agorot is 0 and filter is on', () => {
      const product = { ...baseProduct, shipping_price_agorot: 0 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, freeShipping: true })).toBe(true)
    })

    it('rejects when shipping_price_agorot is non-zero and filter is on', () => {
      const product = { ...baseProduct, shipping_price_agorot: 1000 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, freeShipping: true })).toBe(false)
    })

    it('rejects when shipping_price_agorot is null and filter is on', () => {
      const product = { ...baseProduct, shipping_price_agorot: null }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, freeShipping: true })).toBe(false)
    })

    it('matches when filter is off regardless of shipping price', () => {
      const product = { ...baseProduct, shipping_price_agorot: 2000 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, freeShipping: false })).toBe(true)
    })
  })

  describe('price_100 filter', () => {
    it('matches when kenyon_price is exactly 100₪', () => {
      const product = { ...baseProduct, kenyon_price: 100 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price100: true })).toBe(true)
    })

    it('matches when kenyon_price is under 100₪', () => {
      const product = { ...baseProduct, kenyon_price: 99.99 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price100: true })).toBe(true)
    })

    it('rejects when kenyon_price is over 100₪', () => {
      const product = { ...baseProduct, kenyon_price: 100.01 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price100: true })).toBe(false)
    })

    it('treats null kenyon_price as 0 and matches', () => {
      const product = { ...baseProduct, kenyon_price: null }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price100: true })).toBe(true)
    })
  })

  describe('price_500 filter', () => {
    it('matches when kenyon_price is exactly 500₪', () => {
      const product = { ...baseProduct, kenyon_price: 500 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price500: true })).toBe(true)
    })

    it('matches when kenyon_price is under 500₪', () => {
      const product = { ...baseProduct, kenyon_price: 499.99 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price500: true })).toBe(true)
    })

    it('rejects when kenyon_price is over 500₪', () => {
      const product = { ...baseProduct, kenyon_price: 500.01 }
      expect(matchesCategoryFilters(product, { ...NO_FILTERS, price500: true })).toBe(false)
    })
  })

  describe('multiple filters', () => {
    it('matches only when ALL active filters pass', () => {
      const product: CategoryFilterable = {
        supplier: { open_weekends: true },
        shipping_price_agorot: 0,
        kenyon_price: 80, // 80₪
      }
      const filters: CategoryFilterChips = {
        weekend: true,
        freeShipping: true,
        price100: true,
        price500: false,
      }
      expect(matchesCategoryFilters(product, filters)).toBe(true)
    })

    it('rejects when any active filter fails', () => {
      const product: CategoryFilterable = {
        supplier: { open_weekends: true },
        shipping_price_agorot: 1000, // not free
        kenyon_price: 80,
      }
      const filters: CategoryFilterChips = {
        weekend: true,
        freeShipping: true,
        price100: true,
        price500: false,
      }
      expect(matchesCategoryFilters(product, filters)).toBe(false)
    })
  })
})

describe('toggleFilterChipHref', () => {
  it('adds a filter when none are active', () => {
    const href = toggleFilterChipHref('/category/hot-deals', new URLSearchParams(), 'weekend')
    expect(href).toBe('/category/hot-deals?filters=weekend')
  })

  it('removes a filter when it is the only one active', () => {
    const href = toggleFilterChipHref(
      '/category/hot-deals',
      new URLSearchParams('filters=weekend'),
      'weekend',
    )
    expect(href).toBe('/category/hot-deals')
  })

  it('adds a second filter and sorts the list', () => {
    const href = toggleFilterChipHref(
      '/category/hot-deals',
      new URLSearchParams('filters=weekend'),
      'free_shipping',
    )
    // Commas are URL-encoded by URLSearchParams.toString()
    expect(href).toBe('/category/hot-deals?filters=free_shipping%2Cweekend')
  })

  it('removes a filter from a multi-filter URL', () => {
    const href = toggleFilterChipHref(
      '/category/hot-deals',
      new URLSearchParams('filters=free_shipping,price_100,weekend'),
      'price_100',
    )
    expect(href).toBe('/category/hot-deals?filters=free_shipping%2Cweekend')
  })

  it('preserves other query parameters', () => {
    const href = toggleFilterChipHref(
      '/category/hot-deals',
      new URLSearchParams('sort=price_asc&min=50&filters=weekend'),
      'free_shipping',
    )
    expect(href).toContain('sort=price_asc')
    expect(href).toContain('min=50')
    expect(href).toContain('filters=free_shipping%2Cweekend')
  })

  it('removes page parameter when toggling a filter', () => {
    const href = toggleFilterChipHref(
      '/category/hot-deals',
      new URLSearchParams('page=3&filters=weekend'),
      'free_shipping',
    )
    expect(href).not.toContain('page=')
    expect(href).toContain('filters=free_shipping%2Cweekend')
  })

  it('works with all four filter keys', () => {
    const base = new URLSearchParams()
    const href1 = toggleFilterChipHref('/cat', base, 'weekend')
    expect(href1).toBe('/cat?filters=weekend')

    const href2 = toggleFilterChipHref('/cat', new URLSearchParams('filters=weekend'), 'price_100')
    expect(href2).toBe('/cat?filters=price_100%2Cweekend')

    const href3 = toggleFilterChipHref(
      '/cat',
      new URLSearchParams('filters=price_100,weekend'),
      'price_500',
    )
    expect(href3).toBe('/cat?filters=price_100%2Cprice_500%2Cweekend')

    const href4 = toggleFilterChipHref(
      '/cat',
      new URLSearchParams('filters=price_100,price_500,weekend'),
      'free_shipping',
    )
    expect(href4).toBe('/cat?filters=free_shipping%2Cprice_100%2Cprice_500%2Cweekend')
  })
})
