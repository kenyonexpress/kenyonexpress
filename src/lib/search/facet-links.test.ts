import { describe, expect, it } from 'vitest'
import {
  MAX_OPTIONS_PER_FACET,
  activeFacetChips,
  buildFacetSections,
  clearFacetsHref,
  facetHref,
  hasActiveFacets,
  toFacetSearchParams,
} from './facet-links'
import { parseFacetedParams } from './faceted'

function sp(qs: string): URLSearchParams {
  return new URLSearchParams(qs)
}

describe('facetHref', () => {
  it('adds a value and keeps the query', () => {
    // URLSearchParams serialises, so a space is a plus and Hebrew is percent
    // encoded: the href round-trips through the same parser on the way back.
    const href = facetHref(sp('q=ספא'), 'city', 'תל אביב')
    const out = new URLSearchParams(href.replace('/search?', ''))
    expect(href.startsWith('/search?')).toBe(true)
    expect(out.get('q')).toBe('ספא')
    expect(out.get('city')).toBe('תל אביב')
  })

  it('clears the value when it is the one already selected', () => {
    // A selected facet's link is its own off switch: one URL per state.
    expect(facetHref(sp('q=ספא&city=חיפה'), 'city', 'חיפה')).toBe(
      `/search?q=${encodeURIComponent('ספא')}`,
    )
  })

  it('replaces rather than stacks a second value on the same facet', () => {
    const href = facetHref(sp('q=x&type=coupon'), 'type', 'physical')
    expect(href).toBe('/search?q=x&type=physical')
  })

  it('keeps the other facets and the sort, and drops the offset', () => {
    const href = facetHref(sp('q=x&type=coupon&sort=price_asc&offset=48'), 'brand', 'sony')
    const out = new URLSearchParams(href.split('?')[1])
    expect(out.get('type')).toBe('coupon')
    expect(out.get('sort')).toBe('price_asc')
    expect(out.get('brand')).toBe('sony')
    expect(out.get('offset')).toBeNull()
  })

  it('never forwards a parameter it does not know', () => {
    // A crafted URL must not become a crafted link on every facet.
    const href = facetHref(sp('q=x&utm_source=evil&redirect=//x'), 'type', 'coupon')
    expect(href).toBe('/search?q=x&type=coupon')
  })
})

describe('clearFacetsHref', () => {
  it('drops every facet and keeps the query and sort', () => {
    expect(clearFacetsHref(sp('q=x&type=coupon&city=חיפה&sort=newest'))).toBe(
      '/search?q=x&sort=newest',
    )
  })
})

describe('buildFacetSections', () => {
  const distribution = {
    type: { coupon: 7, physical: 3 },
    category_slug: { spa: 5, food: 5 },
    city: {},
    in_stock: { true: 9, false: 1 },
  }

  it('renders one section per non-empty facet, in the fixed order', () => {
    const sections = buildFacetSections(distribution, sp('q=x'))
    expect(sections.map((s) => s.name)).toEqual(['type', 'category_slug', 'in_stock'])
  })

  it('orders options by count, then name, and labels the known values', () => {
    const [type, category, stock] = buildFacetSections(distribution, sp('q=x'))
    expect(type?.options.map((o) => [o.label, o.count])).toEqual([
      ['קופונים', 7],
      ['מוצרים פיזיים', 3],
    ])
    expect(category?.options.map((o) => o.value)).toEqual(['food', 'spa'])
    expect(stock?.options.map((o) => o.label)).toEqual(['במלאי', 'אזל מהמלאי'])
  })

  it('marks the selected value and links it to its own removal', () => {
    const [type] = buildFacetSections(distribution, sp('q=x&type=coupon'))
    const coupon = type?.options.find((o) => o.value === 'coupon')
    expect(coupon?.selected).toBe(true)
    expect(coupon?.href).toBe('/search?q=x')
    expect(type?.options.find((o) => o.value === 'physical')?.selected).toBe(false)
  })

  it('caps the long tail but never hides the selected value', () => {
    const many: Record<string, number> = {}
    for (let i = 0; i < 30; i++) many[`brand-${String(i).padStart(2, '0')}`] = 30 - i
    const [brand] = buildFacetSections({ brand: many }, sp('q=x&brand=brand-29'))
    expect(brand?.options).toHaveLength(MAX_OPTIONS_PER_FACET + 1)
    expect(brand?.options.at(-1)).toMatchObject({ value: 'brand-29', selected: true, count: 1 })
  })

  it('keeps a selected facet visible even when the engine returned no bucket for it', () => {
    // Narrowed to zero results: the shopper must still see the filter to clear it.
    const [city] = buildFacetSections({ city: {} }, sp('q=x&city=אילת'))
    expect(city?.options).toEqual([
      expect.objectContaining({ value: 'אילת', count: 0, selected: true }),
    ])
  })
})

describe('activeFacetChips', () => {
  it('lists what the URL narrows by, each with its removal link', () => {
    const chips = activeFacetChips(sp('q=x&type=coupon&city=חיפה'))
    expect(chips.map((c) => [c.label, c.valueLabel])).toEqual([
      ['סוג', 'קופונים'],
      ['עיר', 'חיפה'],
    ])
    expect(chips[0]?.href).toBe(`/search?q=x&city=${encodeURIComponent('חיפה')}`)
  })
})

describe('toFacetSearchParams', () => {
  it('carries the query and facets across and asks for the page size', () => {
    const params = toFacetSearchParams({ q: ' ספא ', type: 'coupon', city: ['חיפה', 'x'] })
    expect(params.get('q')).toBe('ספא')
    expect(params.get('type')).toBe('coupon')
    expect(params.get('city')).toBe('חיפה')
    expect(params.get('limit')).toBe('48')
  })

  it('maps the listing sidebar price names onto the facet names as whole shekels', () => {
    const params = toFacetSearchParams({ q: 'x', min: '49.9', max: '200' })
    expect(params.get('price_min')).toBe('49')
    expect(params.get('price_max')).toBe('200')
    expect(parseFacetedParams(params)).toMatchObject({ ok: true })
  })

  it('drops a price that is not a number rather than passing it on to a 400', () => {
    const params = toFacetSearchParams({ q: 'x', min: 'abc', max: '-5' })
    expect(params.get('price_min')).toBeNull()
    expect(params.get('price_max')).toBeNull()
  })
})

describe('hasActiveFacets', () => {
  it('is false for a bare query and true for any narrowing', () => {
    const bare = parseFacetedParams(sp('q=x'))
    const narrowed = parseFacetedParams(sp('q=x&in_stock=true'))
    if (!bare.ok || !narrowed.ok) throw new Error('parse failed')
    expect(hasActiveFacets(bare.params)).toBe(false)
    expect(hasActiveFacets(narrowed.params)).toBe(true)
  })
})
