import { describe, expect, it } from 'vitest'
import { NO_FILTERS, matchesCategoryFilters } from './category-filter-chips'
import { opensOnWeekend } from './opening-hours'

describe('opensOnWeekend', () => {
  it('is true when fri or sat is open', () => {
    expect(opensOnWeekend({ fri: { open: true } })).toBe(true)
    expect(opensOnWeekend({ sat: { open: true }, fri: { open: false } })).toBe(true)
  })
  it('is false for weekdays only, missing, null or non-boolean open', () => {
    expect(
      opensOnWeekend({ sun: { open: true }, fri: { open: false }, sat: { open: false } }),
    ).toBe(false)
    expect(opensOnWeekend({ fri: { open: 'true' } })).toBe(false)
    expect(opensOnWeekend(null)).toBe(false)
    expect(opensOnWeekend(undefined)).toBe(false)
    expect(opensOnWeekend('x')).toBe(false)
  })
})

describe('weekend chip reads opening_hours', () => {
  const on = { ...NO_FILTERS, weekend: true }
  it('matches a product open Saturday with no supplier flag', () => {
    expect(matchesCategoryFilters({ opening_hours: { sat: { open: true } } }, on)).toBe(true)
  })
  it('rejects a product open only on weekdays', () => {
    expect(matchesCategoryFilters({ opening_hours: { mon: { open: true } } }, on)).toBe(false)
  })
  it('free shipping still needs shipping_price_agorot = 0', () => {
    const f = { ...NO_FILTERS, freeShipping: true }
    expect(matchesCategoryFilters({ shipping_price_agorot: 0 }, f)).toBe(true)
    expect(matchesCategoryFilters({ shipping_price_agorot: 1500 }, f)).toBe(false)
  })
})
