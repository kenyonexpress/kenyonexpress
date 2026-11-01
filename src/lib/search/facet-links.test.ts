import { describe, expect, it } from 'vitest'
import {
  MAX_OPTIONS_PER_FACET,
  activeFacetChips,
  buildFacetSections,
  buildSortOptions,
  categoryTreeEntries,
  clearFacetsHref,
  discountBuckets,
  facetHref,
  hasActiveFacets,
  sortHref,
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

describe('sortHref', () => {
  it('sets the sort and keeps the query, the price bounds and every facet', () => {
    const href = sortHref(sp('q=spa&city=haifa&type=coupon&min=10&max=90'), 'price_asc')
    const next = new URL(href, 'http://x').searchParams
    expect(Object.fromEntries(next)).toEqual({
      q: 'spa',
      city: 'haifa',
      type: 'coupon',
      min: '10',
      max: '90',
      sort: 'price_asc',
    })
  })

  it('replaces an existing sort and drops the offset and the limit', () => {
    const href = sortHref(sp('q=spa&sort=newest&offset=96&limit=48'), 'price_desc')
    expect(href).toBe('/search?q=spa&sort=price_desc')
  })

  it('removes the parameter for the relevance order', () => {
    expect(sortHref(sp('q=spa&sort=newest&city=haifa'), null)).toBe('/search?q=spa&city=haifa')
  })

  it('produces only values the engine parser accepts', () => {
    for (const option of buildSortOptions(sp('q=spa'))) {
      const params = new URL(option.href, 'http://x').searchParams
      expect(parseFacetedParams(params).ok).toBe(true)
    }
  })
})

describe('buildSortOptions', () => {
  it('selects relevance when the URL names no sort', () => {
    const options = buildSortOptions(sp('q=spa'))
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual([null])
  })

  it('selects exactly the sort in the URL', () => {
    const options = buildSortOptions(sp('q=spa&sort=price_desc'))
    expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(['price_desc'])
  })

  it('selects nothing for a sort the engine refuses', () => {
    expect(buildSortOptions(sp('q=spa&sort=bogus')).some((o) => o.selected)).toBe(false)
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

describe('discountBuckets', () => {
  it('nests the thresholds: a deeper discount counts under every shallower one', () => {
    expect(discountBuckets({ '0': 4, '1000': 1, '3000': 2, '9000': 1 })).toEqual({
      '10': 4,
      '25': 3,
      '50': 1,
    })
  })

  it('offers no threshold that nothing reaches', () => {
    expect(discountBuckets({ '0': 3, '999': 2 })).toEqual({})
  })
})

describe('categoryTreeEntries', () => {
  const index = [
    { id: 'r1', slug: 'leisure', name_he: 'פנאי', parent_id: null },
    { id: 'c1', slug: 'spa', name_he: 'ספא', parent_id: 'r1' },
    { id: 'g1', slug: 'couples-spa', name_he: 'ספא זוגי', parent_id: 'c1' },
    { id: 'c2', slug: 'food', name_he: 'אוכל', parent_id: 'r1' },
    { id: 'r2', slug: 'home', name_he: 'בית', parent_id: null },
    { id: 'r3', slug: 'empty', name_he: 'ריק', parent_id: null },
  ]

  it('rolls a child count up into every ancestor and walks parents first', () => {
    const entries = categoryTreeEntries({ 'couples-spa': 2, food: 1, home: 5 }, index)
    expect(entries).toEqual([
      { value: 'home', count: 5, depth: 0 },
      { value: 'leisure', count: 3, depth: 0 },
      { value: 'spa', count: 2, depth: 1 },
      { value: 'couples-spa', count: 2, depth: 2 },
      { value: 'food', count: 1, depth: 1 },
    ])
  })

  it('keeps a slug the index does not know, at the top level', () => {
    const entries = categoryTreeEntries({ retired: 3 }, index)
    expect(entries).toEqual([{ value: 'retired', count: 3, depth: 0 }])
  })
})

describe('the facets added for the closeout', () => {
  const context = {
    categoryIndex: [
      { id: 'r1', slug: 'leisure', name_he: 'פנאי', parent_id: null },
      { id: 'c1', slug: 'spa', name_he: 'ספא', parent_id: 'r1' },
    ],
    supplierNames: { '11111111-1111-4111-8111-111111111111': 'ספא הגליל' },
  }
  const distribution = {
    category_slug: { spa: 2 },
    supplier_id: {
      '11111111-1111-4111-8111-111111111111': 2,
      '22222222-2222-4222-8222-222222222222': 1,
    },
    discount_bp: { '0': 1, '5000': 2 },
  }

  it('labels a category by name and indents the child under its parent', () => {
    const section = buildFacetSections(distribution, sp('q=spa'), '/search', context).find(
      (s) => s.name === 'category_slug',
    )
    expect(section?.options.map((o) => [o.label, o.count, o.depth])).toEqual([
      ['פנאי', 2, 0],
      ['ספא', 2, 1],
    ])
  })

  it('offers a supplier by its name and leaves out one it cannot name', () => {
    const section = buildFacetSections(distribution, sp('q=spa'), '/search', context).find(
      (s) => s.name === 'supplier_id',
    )
    expect(section?.options.map((o) => o.label)).toEqual(['ספא הגליל'])
    expect(section?.options[0]?.href).toBe(
      '/search?q=spa&supplier=11111111-1111-4111-8111-111111111111',
    )
  })

  it('offers discount thresholds smallest first, as links the parser accepts', () => {
    const section = buildFacetSections(distribution, sp('q=spa'), '/search', context).find(
      (s) => s.name === 'discount_bp',
    )
    expect(section?.options.map((o) => [o.label, o.count])).toEqual([
      ['10% ומעלה', 2],
      ['25% ומעלה', 2],
      ['50% ומעלה', 2],
    ])
    for (const option of section?.options ?? []) {
      const parsed = parseFacetedParams(new URL(option.href, 'http://x').searchParams)
      expect(parsed.ok).toBe(true)
    }
  })

  it('carries the new parameters to the engine and counts them as narrowing', () => {
    const params = toFacetSearchParams({
      q: 'spa',
      supplier: '11111111-1111-4111-8111-111111111111',
      discount_min: '25',
    })
    const parsed = parseFacetedParams(params)
    expect(parsed.ok && parsed.params.supplier).toBe('11111111-1111-4111-8111-111111111111')
    expect(parsed.ok && parsed.params.discountMin).toBe(25)
    expect(parsed.ok && hasActiveFacets(parsed.params)).toBe(true)
  })

  it('names the supplier on its active chip', () => {
    const chips = activeFacetChips(
      sp('q=spa&supplier=11111111-1111-4111-8111-111111111111&discount_min=50'),
      '/search',
      context,
    )
    expect(chips.map((c) => `${c.label}: ${c.valueLabel}`)).toEqual([
      'הנחה: 50% ומעלה',
      'ספק: ספא הגליל',
    ])
  })
})
