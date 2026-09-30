import { describe, expect, it } from 'vitest'
import {
  firstImage,
  formatCountdown,
  pickCategoryTiles,
  pickDealOfTheDay,
  secondsUntilJerusalemMidnight,
} from './below-fold-rules'

describe('pickCategoryTiles', () => {
  const images = { spa: '/images/spa.webp', food: '/images/food.webp' }

  it('puts photographed categories first and keeps menu order within each group', () => {
    const tiles = pickCategoryTiles(
      [
        { slug: 'new', name_he: 'החדשים', image_url: null },
        { slug: 'spa', name_he: 'ספא', image_url: null },
        { slug: 'hot', name_he: 'חם', image_url: null },
        { slug: 'food', name_he: 'אוכל', image_url: null },
      ],
      images,
    )
    expect(tiles.map((t) => t.slug)).toEqual(['spa', 'food', 'new', 'hot'])
  })

  it('lets an uploaded image on the row win over the ingested file', () => {
    const [tile] = pickCategoryTiles(
      [{ slug: 'spa', name_he: 'ספא', image_url: 'https://r2.example/spa.webp' }],
      images,
    )
    expect(tile?.imageUrl).toBe('https://r2.example/spa.webp')
  })

  it('caps at the limit and fills with unphotographed tiles rather than dropping them', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      slug: `c${i}`,
      name_he: `קטגוריה ${i}`,
      image_url: null,
    }))
    expect(pickCategoryTiles(rows, {}, 8)).toHaveLength(8)
    expect(pickCategoryTiles(rows, {}, 8)[0]?.imageUrl).toBeNull()
  })
})

describe('secondsUntilJerusalemMidnight', () => {
  it('counts down to Israel midnight, not UTC midnight', () => {
    // 2026-06-15 20:00:00 UTC is 23:00:00 in Israel (UTC+3 in summer).
    expect(secondsUntilJerusalemMidnight(new Date('2026-06-15T20:00:00Z'))).toBe(3600)
    // 2026-01-15 20:00:00 UTC is 22:00:00 in Israel (UTC+2 in winter).
    expect(secondsUntilJerusalemMidnight(new Date('2026-01-15T20:00:00Z'))).toBe(7200)
  })

  it('never reports zero: at midnight a full day starts', () => {
    expect(secondsUntilJerusalemMidnight(new Date('2026-06-15T21:00:00Z'))).toBe(86_400)
    expect(secondsUntilJerusalemMidnight(new Date('2026-06-15T20:59:59Z'))).toBe(1)
  })
})

describe('formatCountdown', () => {
  it('renders HH:MM:SS with leading zeros', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(3661)).toBe('01:01:01')
    expect(formatCountdown(86_400)).toBe('24:00:00')
  })

  it('floors fractions and clamps negatives', () => {
    expect(formatCountdown(59.9)).toBe('00:00:59')
    expect(formatCountdown(-5)).toBe('00:00:00')
  })
})

describe('firstImage', () => {
  it('reads both shapes the import wrote', () => {
    expect(firstImage(['/a.webp', '/b.webp'])).toBe('/a.webp')
    expect(firstImage([{ url: '/a.webp' }])).toBe('/a.webp')
    expect(firstImage([])).toBeNull()
    expect(firstImage(null)).toBeNull()
    expect(firstImage([''])).toBeNull()
  })
})

describe('pickDealOfTheDay', () => {
  const base = {
    status: 'active',
    stock_quantity: 10,
    images: ['/p.webp'],
    category: { name_he: 'ספא', slug: 'spa' },
  }

  it('takes the deepest discount that a card can show', () => {
    const deal = pickDealOfTheDay([
      {
        ...base,
        id: 'a',
        slug: 'a',
        name_he: 'א',
        kenyon_price_agorot: 9000,
        full_price_agorot: 10000,
      },
      {
        ...base,
        id: 'b',
        slug: 'b',
        name_he: 'ב',
        kenyon_price_agorot: 5000,
        full_price_agorot: 10000,
      },
      // Deeper, but no photograph: not showable.
      {
        ...base,
        id: 'c',
        slug: 'c',
        name_he: 'ג',
        kenyon_price_agorot: 1000,
        full_price_agorot: 10000,
        images: [],
      },
    ])
    expect(deal?.id).toBe('b')
    expect(deal?.discountBp).toBe(5000)
    expect(deal?.imageUrl).toBe('/p.webp')
    expect(deal?.category?.slug).toBe('spa')
  })

  it('is null when nothing is discounted', () => {
    expect(
      pickDealOfTheDay([
        {
          ...base,
          id: 'a',
          slug: 'a',
          name_he: 'א',
          kenyon_price_agorot: 10000,
          full_price_agorot: 10000,
        },
      ]),
    ).toBeNull()
    expect(pickDealOfTheDay([])).toBeNull()
  })

  it('skips sold-out and inactive rows the way the cron does', () => {
    expect(
      pickDealOfTheDay([
        {
          ...base,
          id: 'a',
          slug: 'a',
          name_he: 'א',
          kenyon_price_agorot: 5000,
          full_price_agorot: 10000,
          stock_quantity: 0,
        },
        {
          ...base,
          id: 'b',
          slug: 'b',
          name_he: 'ב',
          kenyon_price_agorot: 5000,
          full_price_agorot: 10000,
          status: 'draft',
        },
      ]),
    ).toBeNull()
  })
})
