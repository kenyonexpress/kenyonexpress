import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_TILE_IMAGES } from '@/lib/assets'
import { KE_LIVE_CATEGORIES } from '@/lib/ke-live-hero-data'
import type { MerchantDirectoryEntry } from '@/lib/merchant-directory'
import { describe, expect, it } from 'vitest'
import {
  HOME_BRAND_COUNT,
  firstImage,
  formatCountdown,
  pickBrandTiles,
  pickCategoryTiles,
  pickDealOfTheDay,
  secondsUntilJerusalemMidnight,
  tileLabel,
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

  it('prints the row name through tileLabel, so the live "דיל חם 🔥" tile reads "דיל חם"', () => {
    const [tile] = pickCategoryTiles(
      [{ slug: 'hot-deals', name_he: 'דיל חם 🔥', image_url: null }],
      images,
    )
    expect(tile?.nameHe).toBe('דיל חם')
  })
})

/**
 * UX07 (14.10.2026): the tile is a photograph of the department, so the name
 * beside it carries no second, font-dependent picture. The database rows keep
 * their emoji (the hero panel prints live's "דילים חמים 🔥" as live does);
 * this is the grid's rule only.
 */
describe('tileLabel', () => {
  it('strips an emoji and the space it leaves', () => {
    expect(tileLabel('דיל חם 🔥')).toBe('דיל חם')
    expect(tileLabel('🔥 דיל חם')).toBe('דיל חם')
    expect(tileLabel('דיל 🔥 חם')).toBe('דיל חם')
  })

  it('strips variation selectors, joiners and multi-codepoint sequences', () => {
    expect(tileLabel('חדש ✨\uFE0F')).toBe('חדש')
    expect(tileLabel('משפחה 👨\u200D👩\u200D👧')).toBe('משפחה')
    expect(tileLabel('👍🏽 מומלץ')).toBe('מומלץ')
  })

  it('leaves a shekel price with its LTR isolate and no-break space intact', () => {
    const under99 = 'עד \u206699\u00A0₪\u2069'
    expect(tileLabel(under99)).toBe(under99)
  })

  it('leaves Latin, digits and punctuation alone', () => {
    expect(tileLabel('קורסים Express – בקרוב . . .')).toBe('קורסים Express – בקרוב . . .')
  })
})

/**
 * Every live top-level department has a photograph, and the file is really
 * there. Production's thirteen active top-level rows all carry a null
 * `image_url`, so this map is the only picture a tile has; the slug list is
 * live's own (KE_LIVE_CATEGORIES) plus `electronics`, which is in the table
 * but not in live's menu. Eight of thirteen used to be mapped, which was
 * exactly the grid's eight, so the other five were sorted to the back and
 * dropped, and a menu reorder would have put a grey box on the home page.
 */
describe('CATEGORY_TILE_IMAGES', () => {
  const liveSlugs = [...KE_LIVE_CATEGORIES.map((c) => c.slug), 'electronics']

  it('maps every live top-level slug', () => {
    for (const slug of liveSlugs) {
      expect(CATEGORY_TILE_IMAGES[slug], `${slug} has no tile photograph`).toBeTruthy()
    }
  })

  it('points every slug at a file under public/', () => {
    for (const [slug, url] of Object.entries(CATEGORY_TILE_IMAGES)) {
      expect(url.startsWith('/images/'), `${slug}: ${url} is not an ingested file`).toBe(true)
      expect(existsSync(join(process.cwd(), 'public', url)), `${slug}: ${url} is missing`).toBe(
        true,
      )
    }
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

describe('pickBrandTiles (UX11)', () => {
  const entry = (
    id: string,
    name: string,
    couponCount: number,
    logoUrl: string | null = null,
  ): MerchantDirectoryEntry => ({ id, name, city: null, logoUrl, categories: [], couponCount })

  it('drops a merchant with nothing on sale and keeps the directory order otherwise', () => {
    const tiles = pickBrandTiles(
      [entry('a', 'אלף', 3), entry('b', 'בית', 0), entry('c', 'גימל', 1)],
      12,
    )
    expect(tiles.map((t) => t.id)).toEqual(['a', 'c'])
    expect(tiles[0]).toEqual({ id: 'a', name: 'אלף', logoUrl: null, href: '/s/a' })
  })

  it('puts logo tiles before wordmarks, keeping the order inside each group', () => {
    const tiles = pickBrandTiles(
      [
        entry('a', 'אלף', 5),
        entry('b', 'בית', 4, '/images/b.webp'),
        entry('c', 'גימל', 3),
        entry('d', 'דלת', 2, 'https://cdn.kenyonexpress.co.il/d.png'),
      ],
      12,
    )
    expect(tiles.map((t) => t.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('renders a wordmark for a logo next/image would refuse, instead of throwing', () => {
    const tiles = pickBrandTiles(
      [
        entry('a', 'אלף', 1, 'https://evil.example/logo.png'),
        entry('b', 'בית', 1, 'http://kenyonexpress.co.il/plain.png'),
        entry('c', 'גימל', 1, '//cdn.kenyonexpress.co.il/x.png'),
        entry('d', 'דלת', 1, '  /images/d.webp  '),
      ],
      12,
    )
    expect(tiles.map((t) => [t.id, t.logoUrl])).toEqual([
      ['d', '/images/d.webp'],
      ['a', null],
      ['b', null],
      ['c', null],
    ])
  })

  it('collapses whitespace in the name and drops a blank one', () => {
    const tiles = pickBrandTiles([entry('a', '  טק   וורלד ', 1), entry('b', '   ', 1)], 12)
    expect(tiles).toEqual([{ id: 'a', name: 'טק וורלד', logoUrl: null, href: '/s/a' }])
  })

  it('caps at the limit, after the grouping', () => {
    const many = Array.from({ length: 15 }, (_, i) => entry(`m${i}`, `עסק ${i}`, 15 - i))
    expect(pickBrandTiles(many, HOME_BRAND_COUNT)).toHaveLength(12)
    expect(pickBrandTiles(many, 0)).toEqual([])
  })
})
