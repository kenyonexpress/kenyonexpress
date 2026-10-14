import { describe, expect, it } from 'vitest'
import { toFacetSearchParams } from './facet-links'
import {
  MAX_SEARCH_PAGE,
  SEARCH_PAGE_SIZE,
  parseSearchPage,
  searchOffset,
  totalSearchPages,
} from './paging'
import {
  activeSearchChips,
  activeSearchFilterCount,
  clearSearchFiltersHref,
  parseSearchSort,
  priceChipLabel,
  searchCountText,
  searchLinkParams,
} from './results-page'

function sp(qs: string): URLSearchParams {
  return new URLSearchParams(qs)
}

/**
 * UX21: the results page's controls. Measured before: the engine accepted a
 * sort nothing set, the facets sat below the grid off screen, the chips of a
 * narrowed-empty search sat under the empty state, and 48 hits had no page
 * two. Every rule the new bar, strip and pagination follow is pinned here.
 */
describe('paging', () => {
  it('reads ?page= as a positive integer, first page otherwise, capped at the engine offset ceiling', () => {
    expect(parseSearchPage(undefined)).toBe(1)
    expect(parseSearchPage('')).toBe(1)
    expect(parseSearchPage('0')).toBe(1)
    expect(parseSearchPage('-2')).toBe(1)
    expect(parseSearchPage('abc')).toBe(1)
    expect(parseSearchPage('2.5')).toBe(1)
    expect(parseSearchPage('3')).toBe(3)
    expect(parseSearchPage(['4', '9'])).toBe(4)
    expect(parseSearchPage('9999')).toBe(MAX_SEARCH_PAGE)
  })

  it('turns a page into the engine offset and a total into a page count', () => {
    expect(SEARCH_PAGE_SIZE).toBe(24)
    expect(searchOffset(1)).toBe(0)
    expect(searchOffset(3)).toBe(48)
    expect(totalSearchPages(0)).toBe(1)
    expect(totalSearchPages(24)).toBe(1)
    expect(totalSearchPages(25)).toBe(2)
    expect(totalSearchPages(100_000)).toBe(MAX_SEARCH_PAGE)
    // The last allowed page's offset still fits under the parser's 1000.
    expect(searchOffset(MAX_SEARCH_PAGE)).toBeLessThanOrEqual(1000)
  })

  it('is what the page hands the engine: page size as limit, page as offset', () => {
    const first = toFacetSearchParams({ q: 'ספא' })
    expect(first.get('limit')).toBe(String(SEARCH_PAGE_SIZE))
    expect(first.get('offset')).toBeNull()

    const third = toFacetSearchParams({ q: 'ספא', page: '3' })
    expect(third.get('offset')).toBe('48')
    expect(third.has('page')).toBe(false)

    expect(toFacetSearchParams({ q: 'ספא', page: 'x' }).get('offset')).toBeNull()
  })
})

describe('parseSearchSort', () => {
  it('accepts the four orders and falls back to relevance', () => {
    expect(parseSearchSort(undefined)).toBe('relevance')
    expect(parseSearchSort('newest')).toBe('newest')
    expect(parseSearchSort('price_asc')).toBe('price_asc')
    expect(parseSearchSort('price_desc')).toBe('price_desc')
    expect(parseSearchSort('name')).toBe('relevance')
    expect(parseSearchSort(['price_desc'])).toBe('price_desc')
  })
})

describe('searchLinkParams', () => {
  it('carries the query, sort, facets and price, never the page or the engine window', () => {
    expect(
      searchLinkParams(
        sp('q=ספא&sort=newest&city=חיפה&price_min=50&price_max=200&page=3&limit=24&offset=48'),
      ),
    ).toEqual({
      q: 'ספא',
      sort: 'newest',
      city: 'חיפה',
      price_min: '50',
      price_max: '200',
    })
  })

  it('drops blank values', () => {
    expect(searchLinkParams(sp('q=ספא&city=&brand=%20'))).toEqual({ q: 'ספא' })
  })
})

describe('activeSearchChips', () => {
  it('is empty on an unfiltered search', () => {
    expect(activeSearchChips(sp('q=ספא&sort=newest&page=2'))).toEqual([])
    expect(activeSearchFilterCount(sp('q=ספא'))).toBe(0)
  })

  it('names every facet with its display value and links to the search without it', () => {
    const chips = activeSearchChips(sp('q=ספא&type=coupon&city=חיפה'))
    expect(chips.map((c) => [c.key, c.label, c.valueLabel])).toEqual([
      ['type', 'סוג', 'קופונים'],
      ['city', 'עיר', 'חיפה'],
    ])
    const withoutType = new URLSearchParams((chips[0] as { href: string }).href.split('?')[1])
    expect(withoutType.get('q')).toBe('ספא')
    expect(withoutType.get('city')).toBe('חיפה')
    expect(withoutType.has('type')).toBe(false)
  })

  it('adds one price chip for either bound, after the facets, that drops both bounds', () => {
    const chips = activeSearchChips(sp('q=ספא&city=חיפה&price_min=50&price_max=200&sort=newest'))
    const price = chips[chips.length - 1] as { key: string; valueLabel: string; href: string }
    expect(price.key).toBe('price')
    expect(price.valueLabel).toBe('⁦50 ₪⁩ עד ⁦200 ₪⁩')
    const out = new URLSearchParams(price.href.split('?')[1])
    expect(out.get('q')).toBe('ספא')
    expect(out.get('city')).toBe('חיפה')
    expect(out.get('sort')).toBe('newest')
    expect(out.has('price_min')).toBe(false)
    expect(out.has('price_max')).toBe(false)
    expect(activeSearchFilterCount(sp('q=ספא&city=חיפה&price_min=50'))).toBe(2)
  })

  it('reads one bound alone', () => {
    expect(priceChipLabel('50', null)).toBe('מ-⁦50 ₪⁩')
    expect(priceChipLabel(null, '200')).toBe('עד ⁦200 ₪⁩')
    expect(activeSearchChips(sp('q=ספא&price_max=200'))[0]?.valueLabel).toBe('עד ⁦200 ₪⁩')
  })
})

describe('clearSearchFiltersHref', () => {
  it('keeps the query and the sort only', () => {
    expect(clearSearchFiltersHref(sp('q=ספא&sort=newest&city=חיפה&price_min=5&page=2'))).toBe(
      '/search?q=%D7%A1%D7%A4%D7%90&sort=newest',
    )
    expect(clearSearchFiltersHref(sp('city=חיפה'))).toBe('/search')
  })
})

describe('searchCountText', () => {
  it('says how many, and the range only when there is a second page', () => {
    expect(searchCountText(0, 1, 0)).toBe('לא נמצאו מוצרים')
    expect(searchCountText(1, 1, 1)).toBe('נמצא מוצר אחד')
    expect(searchCountText(7, 1, 7)).toBe('נמצאו ⁦7⁩ מוצרים')
    expect(searchCountText(24, 1, 24)).toBe('נמצאו ⁦24⁩ מוצרים')
    expect(searchCountText(60, 1, 24)).toBe('מציג ⁦1–24⁩ מתוך ⁦60⁩ מוצרים')
    expect(searchCountText(60, 3, 12)).toBe('מציג ⁦49–60⁩ מתוך ⁦60⁩ מוצרים')
  })

  it('does not promise cards a page past the end does not hold', () => {
    expect(searchCountText(60, 9, 0)).toBe('נמצאו ⁦60⁩ מוצרים, אין תוצאות בעמוד הזה')
  })
})
