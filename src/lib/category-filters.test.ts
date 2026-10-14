import { HERO_CITIES } from '@/lib/geo/cities'
import { describe, expect, it } from 'vitest'
import { activeFilterChips, activeFilterCount, clearFiltersHref } from './category-filters'

const city = HERO_CITIES[0]

/**
 * The active-filter strip's links (UX14). The record is the pages' own
 * `linkParams`, so a chip can only ever name a facet a page link preserves.
 */
describe('activeFilterChips', () => {
  it('is empty on the bare archive, and on a sorted one', () => {
    expect(activeFilterChips('/products', {})).toEqual([])
    expect(activeFilterChips('/products', { sort: 'price_asc' })).toEqual([])
    expect(activeFilterCount({ sort: 'price_asc' })).toBe(0)
  })

  it('names every facet in Hebrew and links each to the archive without it', () => {
    const params = {
      sort: 'price_asc',
      type: 'coupon',
      brand: 'Sony',
      discount: '20',
      min: '50',
      max: '200',
      city: city?.slug,
    }
    const chips = activeFilterChips('/category/spa', params)
    expect(chips.map((c) => c.key)).toEqual(['type', 'brand', 'discount', 'price', 'city'])
    expect(chips.map((c) => `${c.label}: ${c.value}`)).toEqual([
      'סוג: קופונים',
      'מותג: Sony',
      'הנחה: לפחות ⁦20%⁩',
      'מחיר: ⁦50 ₪⁩ עד ⁦200 ₪⁩',
      `עיר: ${city?.name}`,
    ])
    // Removing one facet keeps the sort and every other facet.
    const type = chips.find((c) => c.key === 'type')
    expect(type?.href).toBe(
      `/category/spa?sort=price_asc&brand=Sony&discount=20&min=50&max=200&city=${city?.slug}`,
    )
    // The price range is one chip and its link drops both bounds.
    const price = chips.find((c) => c.key === 'price')
    expect(price?.href).toBe(
      `/category/spa?sort=price_asc&type=coupon&brand=Sony&discount=20&city=${city?.slug}`,
    )
    expect(activeFilterCount(params)).toBe(5)
  })

  it('reads a one-sided price range', () => {
    expect(activeFilterChips('/products', { min: '50' })[0]?.value).toBe('מ-⁦50 ₪⁩')
    expect(activeFilterChips('/products', { max: '200' })[0]?.value).toBe('עד ⁦200 ₪⁩')
  })

  it('shows an unknown type or city as typed rather than inventing a name', () => {
    const chips = activeFilterChips('/products', { type: 'service', city: 'nowhere' })
    expect(chips.map((c) => c.value)).toEqual(['service', 'nowhere'])
  })

  it('never writes an empty or undefined value into a chip link', () => {
    const chips = activeFilterChips('/products', { type: 'coupon', min: '', brand: undefined })
    expect(chips).toHaveLength(1)
    expect(chips[0]?.href).toBe('/products')
  })
})

describe('clearFiltersHref', () => {
  it('keeps only the sort', () => {
    expect(
      clearFiltersHref('/products', {
        sort: 'newest',
        type: 'coupon',
        min: '1',
        max: '9',
        city: 'x',
      }),
    ).toBe('/products?sort=newest')
    expect(clearFiltersHref('/products', { type: 'coupon' })).toBe('/products')
  })
})
