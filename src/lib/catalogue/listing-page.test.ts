import { describe, expect, it } from 'vitest'
import { MAX_LISTING_PAGE, parseListingPage, toListingCard } from './listing-page'

describe('parseListingPage', () => {
  it('reads a page, defaults to one, and stops at the cap', () => {
    expect(parseListingPage('3')).toBe(3)
    expect(parseListingPage(undefined)).toBe(1)
    expect(parseListingPage('0')).toBe(1)
    expect(parseListingPage('-2')).toBe(1)
    expect(parseListingPage('abc')).toBe(1)
    expect(parseListingPage('999999')).toBe(MAX_LISTING_PAGE)
  })
})

describe('toListingCard', () => {
  it('sends the card its own fields and nothing else from the row', () => {
    const card = toListingCard({
      id: 'p1',
      slug: 'spa-day',
      name_he: 'יום ספא',
      kenyon_price: 100,
      full_price: 400,
      images: ['a.jpg'],
      stock_quantity: 3,
      categories: [{ name_he: 'ספא', slug: 'spa', id: 'c1' } as never],
      supplier: { city: 'חיפה', commission_percent: 12 } as never,
      created_at: '2026-01-01',
      type: 'coupon',
      platform_percent: 15,
    })
    expect(card).toEqual({
      id: 'p1',
      slug: 'spa-day',
      name_he: 'יום ספא',
      kenyon_price: 100,
      full_price: 400,
      images: ['a.jpg'],
      stock_quantity: 3,
      categories: [{ name_he: 'ספא', slug: 'spa' }],
      supplier: { city: 'חיפה' },
    })
  })

  it('keeps a distance only when the row has one', () => {
    const base = { id: 'p', slug: 'p', name_he: 'p', kenyon_price: null, images: [] }
    expect('distanceKm' in toListingCard(base)).toBe(false)
    expect(toListingCard({ ...base, distanceKm: 4.2 }).distanceKm).toBe(4.2)
  })
})
