import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { describe, expect, it } from 'vitest'
import {
  FIXTURE_DEALS,
  HOME_DEALS_COUNT,
  type HomeDealRow,
  arrangeHomeDeals,
  hasThumbnail,
  toHomeDeal,
} from './deals'

/**
 * The order and the shape of the home page grid, without a database.
 *
 * The order is the part worth pinning: the comparison gate measures this page
 * against frozen captures band by band, and "the catalogue's rows in live's
 * order" is the whole reason a database-backed grid can score what the fixture
 * scored. A refactor that sorts by `created_at` first would keep every test of
 * the card green and move every band of the gate.
 */

const liveSlugs = KE_LIVE_DEALS.map((deal) => deal.slug)

let counter = 0
function row(overrides: Partial<HomeDealRow> = {}): HomeDealRow {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    slug: `row-${counter}`,
    name_he: `row ${counter}`,
    kenyon_price: 100,
    full_price: null,
    images: ['/images/products/x.webp'],
    stock_quantity: 5,
    created_at: '2026-01-01T00:00:00.000Z',
    city: null,
    categories: null,
    suppliers: null,
    ...overrides,
  }
}

describe('arrangeHomeDeals', () => {
  it("puts the rows live also shows first, in live's order, whatever order they arrived in", () => {
    const [a, b, c] = [liveSlugs[5], liveSlugs[0], liveSlugs[9]]
    const arranged = arrangeHomeDeals([row({ slug: c }), row({ slug: a }), row({ slug: b })])
    expect(arranged.map((deal) => deal.slug)).toEqual([b, a, c])
  })

  it('fills the slot of a live product the catalogue lacks with the newest row live never showed, so the matches keep their slot', () => {
    // Live slots 0 and 2 are here, slot 1 is not. Slot 1 takes the newest
    // fill-in; slot 2's product stays third, in the column the captures have
    // it in. What is left follows the 32 slots, newest first.
    const arranged = arrangeHomeDeals([
      row({ slug: 'older', created_at: '2026-02-01T00:00:00.000Z' }),
      row({ slug: liveSlugs[2] }),
      row({ slug: 'newer', created_at: '2026-03-01T00:00:00.000Z' }),
      row({ slug: liveSlugs[0] }),
    ])
    expect(arranged.map((deal) => deal.slug)).toEqual([
      liveSlugs[0],
      'newer',
      liveSlugs[2],
      'older',
    ])
  })

  it('skips a slot with neither a match nor a fill-in rather than leaving a hole', () => {
    const arranged = arrangeHomeDeals([row({ slug: liveSlugs[0] }), row({ slug: liveSlugs[5] })])
    expect(arranged.map((deal) => deal.slug)).toEqual([liveSlugs[0], liveSlugs[5]])
  })

  it('drops a row with no picture, which is what the e2e fixtures look like', () => {
    const arranged = arrangeHomeDeals([
      row({ slug: 'e2e-test-physical', images: [] }),
      row({ slug: 'no-images-column', images: null }),
      row({ slug: 'pictured' }),
    ])
    expect(arranged.map((deal) => deal.slug)).toEqual(['pictured'])
  })

  it("caps the grid at live's 32 so the page keeps the height the captures have", () => {
    const rows = Array.from({ length: HOME_DEALS_COUNT + 10 }, () => row())
    expect(arrangeHomeDeals(rows)).toHaveLength(HOME_DEALS_COUNT)
    expect(HOME_DEALS_COUNT).toBe(32)
  })
})

describe('toHomeDeal', () => {
  it("prefers the product's own city over the business's, and trims both", () => {
    expect(toHomeDeal(row({ city: ' own ', suppliers: { city: 'theirs' } })).city).toBe('own')
    expect(toHomeDeal(row({ city: '   ', suppliers: { city: ' theirs ' } })).city).toBe('theirs')
    expect(toHomeDeal(row({ city: null, suppliers: { city: null } })).city).toBeNull()
  })

  it('reads a join that came back as an array, the way PostgREST sometimes returns one', () => {
    const deal = toHomeDeal(
      row({
        suppliers: [{ city: 'from-array' }],
        categories: [{ name_he: 'cat', slug: 'cat' }],
      }),
    )
    expect(deal.city).toBe('from-array')
    expect(deal.category).toEqual({ name_he: 'cat', slug: 'cat' })
  })
})

describe('the fixture fallback', () => {
  it('is the capture, card for card, with no city on any of them', () => {
    expect(FIXTURE_DEALS.map((deal) => deal.slug)).toEqual(liveSlugs)
    expect(FIXTURE_DEALS.every((deal) => deal.city === null)).toBe(true)
  })
})

describe('hasThumbnail', () => {
  it('needs a non-empty string in the first slot', () => {
    expect(hasThumbnail(['/a.webp'])).toBe(true)
    expect(hasThumbnail([''])).toBe(false)
    expect(hasThumbnail([])).toBe(false)
    expect(hasThumbnail(null)).toBe(false)
    expect(hasThumbnail('/a.webp')).toBe(false)
  })
})
