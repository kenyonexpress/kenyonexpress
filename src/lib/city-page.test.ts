import { CITIES, cityBySlug } from '@/lib/geo/cities'
import { REGIONS } from '@/lib/regions'
import { describe, expect, it } from 'vitest'
import {
  CITY_PAGE_PRODUCT_COLUMNS,
  CITY_PAGE_SIZE,
  type CityPageProductRow,
  allCityPageSlugs,
  buildCityDeals,
  cityPageDescription,
  cityPageHref,
  cityPageTitle,
  citySlugsOf,
  dealCountLabel,
  pageOfDeals,
  regionOfCity,
  resolveCityPage,
} from './city-page'

/**
 * The city pages (STEP 64): how a segment resolves and where a deal lands.
 *
 * Placement is `productLocation` on free text a person typed, and the
 * failures that matter are silent ones: a spelling variant becoming a second
 * city, a product's own city losing to its supplier's, a Haifa deal appearing
 * under Tel Aviv. None of them throws; each is pinned here.
 */

function row(over: Partial<CityPageProductRow> & { id: string }): CityPageProductRow {
  return {
    slug: over.id,
    name_he: `מוצר ${over.id}`,
    kenyon_price: 100,
    full_price: 200,
    images: [],
    stock_quantity: 5,
    created_at: '2026-10-01T00:00:00Z',
    type: 'coupon',
    supplier_id: 'sup-a',
    categories: { name_he: 'ספא', slug: 'spa' },
    suppliers: { id: 'sup-a', name: 'ספא רוגע', city: 'תל אביב' },
    ...over,
  }
}

describe('resolveCityPage', () => {
  it('answers a city for an ASCII slug, with the region it sits in', () => {
    const target = resolveCityPage('tel-aviv')
    expect(target?.kind).toBe('city')
    if (target?.kind !== 'city') throw new Error('expected a city')
    expect(target.city.name).toBe('תל אביב')
    expect(target.region?.slug).toBe('תל-אביב')
  })

  it('answers a region for a decoded Hebrew slug, with only known cities', () => {
    const target = resolveCityPage('השרון')
    expect(target?.kind).toBe('region')
    if (target?.kind !== 'region') throw new Error('expected a region')
    expect(target.cities.map((c) => c.slug)).toEqual(['herzliya', 'kfar-saba'])
  })

  it('answers an empty region honestly', () => {
    const target = resolveCityPage('גולן')
    if (target?.kind !== 'region') throw new Error('expected a region')
    expect(target.cities).toEqual([])
    expect(citySlugsOf(target)).toEqual([])
  })

  it('answers null for an unknown or encoded slug', () => {
    expect(resolveCityPage('no-such-city')).toBeNull()
    expect(resolveCityPage('')).toBeNull()
    // The route decodes before resolving; a still-encoded value is not a page.
    expect(resolveCityPage(encodeURIComponent('תל-אביב'))).toBeNull()
  })

  it('a city sits in at most one region', () => {
    for (const city of CITIES) {
      const owners = REGIONS.filter((r) => r.cities.includes(city.slug))
      expect(owners.length, city.slug).toBeLessThanOrEqual(1)
      expect(regionOfCity(city.slug)?.slug ?? null).toBe(owners[0]?.slug ?? null)
    }
  })
})

describe('the slug sets', () => {
  it('prerender thirteen cities and seventeen regions with no collision', () => {
    const slugs = allCityPageSlugs()
    expect(slugs).toHaveLength(CITIES.length + REGIONS.length)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(resolveCityPage(slug)).not.toBeNull()
  })

  it('cannot collide: city slugs are ASCII, region slugs are Hebrew', () => {
    for (const city of CITIES) expect(city.slug).toMatch(/^[a-z0-9-]+$/)
    for (const region of REGIONS) expect(region.slug).toMatch(/[א-ת]/)
  })

  it('encodes exactly once at the link boundary', () => {
    expect(cityPageHref('tel-aviv')).toBe('/city/tel-aviv')
    expect(cityPageHref('תל-אביב')).toBe('/city/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91')
  })
})

describe('buildCityDeals', () => {
  it('places a deal by its supplier city and tallies merchant and category', () => {
    const out = buildCityDeals([row({ id: 'a' }), row({ id: 'b' })], ['tel-aviv'])
    expect(out.deals.map((d) => d.id)).toEqual(['a', 'b'])
    expect(out.deals[0]?.city.slug).toBe('tel-aviv')
    expect(out.merchants).toEqual([{ id: 'sup-a', name: 'ספא רוגע', dealCount: 2 }])
    expect(out.categories).toEqual([{ name_he: 'ספא', slug: 'spa', dealCount: 2 }])
    expect(out.perCity).toEqual({ 'tel-aviv': 2 })
  })

  it('treats spelling variants as one city', () => {
    const rows = [
      row({ id: 'a', suppliers: { id: 's1', name: 'א', city: 'תל אביב' } }),
      row({ id: 'b', suppliers: { id: 's2', name: 'ב', city: 'תל-אביב' } }),
      row({ id: 'c', suppliers: { id: 's3', name: 'ג', city: 'תל אביב יפו' } }),
      row({ id: 'd', suppliers: { id: 's4', name: 'ד', city: ' תל אביב ' } }),
    ]
    const out = buildCityDeals(rows, ['tel-aviv'])
    expect(out.deals).toHaveLength(4)
    expect(out.perCity['tel-aviv']).toBe(4)
  })

  it('lets the product city override the supplier city', () => {
    const rows = [row({ id: 'eilat-spa', city: 'אילת' })]
    expect(buildCityDeals(rows, ['tel-aviv']).deals).toEqual([])
    const eilat = buildCityDeals(rows, ['eilat'])
    expect(eilat.deals.map((d) => d.id)).toEqual(['eilat-spa'])
    expect(eilat.deals[0]?.city.slug).toBe('eilat')
  })

  it('leaves an unknown or missing city on no page', () => {
    const rows = [
      row({ id: 'none', suppliers: { id: 's', name: 'ס', city: null } }),
      row({ id: 'free', suppliers: { id: 's', name: 'ס', city: 'רמת' } }),
      row({ id: 'nosup', supplier_id: null, suppliers: null }),
    ]
    for (const city of CITIES) {
      expect(buildCityDeals(rows, [city.slug]).deals).toEqual([])
    }
  })

  it('never shows a deal from another city', () => {
    const rows = [
      row({ id: 'haifa', suppliers: { id: 'h', name: 'ח', city: 'חיפה' } }),
      row({ id: 'tlv' }),
    ]
    const out = buildCityDeals(rows, ['tel-aviv'])
    expect(out.deals.map((d) => d.id)).toEqual(['tlv'])
    expect(out.merchants.map((m) => m.id)).toEqual(['sup-a'])
  })

  it('aggregates a region across its cities and counts each city, zeros included', () => {
    const rows = [
      row({ id: 'h1', suppliers: { id: 'h', name: 'הרצליה בע"מ', city: 'הרצליה' } }),
      row({ id: 'h2', suppliers: { id: 'h', name: 'הרצליה בע"מ', city: 'הרצליה' } }),
      row({ id: 'tlv' }),
    ]
    const out = buildCityDeals(rows, ['herzliya', 'kfar-saba'])
    expect(out.deals.map((d) => d.id)).toEqual(['h1', 'h2'])
    expect(out.perCity).toEqual({ herzliya: 2, 'kfar-saba': 0 })
  })

  it('accepts the embeds as arrays, as PostgREST may return them', () => {
    const rows = [
      row({
        id: 'arr',
        categories: [{ name_he: 'אוכל', slug: 'food' }],
        suppliers: [{ id: 'arr-s', name: 'מערך', city: 'חיפה' }],
      }),
    ]
    const out = buildCityDeals(rows, ['haifa'])
    expect(out.deals[0]?.categories).toEqual([{ name_he: 'אוכל', slug: 'food' }])
    expect(out.deals[0]?.supplier).toEqual({ id: 'arr-s', name: 'מערך', city: 'חיפה' })
  })

  it('orders in-stock deals first, then Hebrew alphabetical; tallies by count then name', () => {
    const rows = [
      row({ id: 'out', name_he: 'אבטיח', stock_quantity: 0 }),
      row({ id: 'gimel', name_he: 'גזר' }),
      row({ id: 'bet', name_he: 'בננה', stock_quantity: null }),
      row({
        id: 'other',
        name_he: 'דובדבן',
        categories: { name_he: 'אוכל', slug: 'food' },
        suppliers: { id: 'sup-b', name: 'אוכל טוב', city: 'תל אביב' },
      }),
    ]
    const out = buildCityDeals(rows, ['tel-aviv'])
    expect(out.deals.map((d) => d.id)).toEqual(['bet', 'gimel', 'other', 'out'])
    expect(out.merchants.map((m) => m.id)).toEqual(['sup-a', 'sup-b'])
    expect(out.categories.map((c) => c.slug)).toEqual(['spa', 'food'])
  })

  it('carries no rating, commission or contact field on a deal', () => {
    const [deal] = buildCityDeals([row({ id: 'a' })], ['tel-aviv']).deals
    const keys = Object.keys(deal ?? {})
    for (const key of keys) {
      expect(key).not.toMatch(/rating|review|percent|split|contact|phone|email/i)
    }
  })
})

describe('the select', () => {
  it('names the location columns of both tables and no private column', () => {
    expect(CITY_PAGE_PRODUCT_COLUMNS).toContain(' city,')
    expect(CITY_PAGE_PRODUCT_COLUMNS).toContain('suppliers(id, name, city, latitude, longitude)')
    expect(CITY_PAGE_PRODUCT_COLUMNS).not.toMatch(/percent|contact|notes|business_id|reviews/)
  })
})

describe('pageOfDeals', () => {
  const deals = buildCityDeals(
    Array.from({ length: CITY_PAGE_SIZE + 3 }, (_, i) =>
      row({ id: `d${String(i).padStart(2, '0')}`, name_he: `מוצר ${String(i).padStart(2, '0')}` }),
    ),
    ['tel-aviv'],
  ).deals

  it('slices a page and numbers it from where it starts', () => {
    const first = pageOfDeals(deals, 1)
    expect(first.items).toHaveLength(CITY_PAGE_SIZE)
    expect(first).toMatchObject({ currentPage: 1, totalPages: 2, from: 1, to: CITY_PAGE_SIZE })
    const second = pageOfDeals(deals, 2)
    expect(second.items).toHaveLength(3)
    expect(second).toMatchObject({ from: CITY_PAGE_SIZE + 1, to: CITY_PAGE_SIZE + 3 })
  })

  it('clamps a page past the end to the last page, and a bad page to the first', () => {
    expect(pageOfDeals(deals, 99).currentPage).toBe(2)
    expect(pageOfDeals(deals, 0).currentPage).toBe(1)
    expect(pageOfDeals(deals, Number.NaN).currentPage).toBe(1)
  })

  it('describes an empty list as zero of zero on one page', () => {
    expect(pageOfDeals([], 3)).toEqual({ items: [], currentPage: 1, totalPages: 1, from: 0, to: 0 })
  })
})

describe('copy', () => {
  it('counts in Hebrew', () => {
    expect(dealCountLabel(0)).toBe('אין דילים כרגע')
    expect(dealCountLabel(1)).toBe('דיל אחד')
    expect(dealCountLabel(7)).toBe('7 דילים')
  })

  it('puts the city name in the title and twice in the description', () => {
    const city = cityBySlug('haifa')
    if (!city) throw new Error('haifa missing')
    expect(cityPageTitle(city.name)).toBe('קופונים ודילים בחיפה')
    const description = cityPageDescription(city.name)
    expect(description.split(city.name).length - 1).toBe(2)
    expect(description.length).toBeLessThanOrEqual(170)
    expect(description).not.toMatch(/\d/)
  })
})
