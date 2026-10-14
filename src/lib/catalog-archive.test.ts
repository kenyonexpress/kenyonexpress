import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_PAGE_ENDPOINT,
  archivePageUrl,
  pageWindow,
  parsePage,
  parsePrice,
  resultCountText,
} from './catalog-archive'

/**
 * The parsers the two archives and the JSON page route share (UX22). The
 * values below are the ones the pages' private copies answered before the
 * hoist, so a change here is a change to what every archive URL means.
 */
describe('archive URL parsers', () => {
  it('reads a page number and falls back to 1 for anything else', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage('1')).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage(['2', '3'])).toBe(1)
  })

  it('reads a non-negative price bound and ignores the rest', () => {
    expect(parsePrice('50')).toBe(50)
    expect(parsePrice('19.9')).toBe(19.9)
    expect(parsePrice('0')).toBe(0)
    expect(parsePrice('-1')).toBeUndefined()
    expect(parsePrice('cheap')).toBeUndefined()
    expect(parsePrice(undefined)).toBeUndefined()
    expect(parsePrice(['1'])).toBeUndefined()
  })
})

describe('pageWindow', () => {
  it('computes the window for a page size', () => {
    expect(pageWindow(46, 1, 24)).toEqual({ totalPages: 2, currentPage: 1, from: 1, to: 24 })
    expect(pageWindow(46, 2, 24)).toEqual({ totalPages: 2, currentPage: 2, from: 25, to: 46 })
  })

  it('clamps a page past the end to the last page and never below one page', () => {
    expect(pageWindow(46, 9, 24)).toEqual({ totalPages: 2, currentPage: 2, from: 25, to: 46 })
    expect(pageWindow(0, 1, 24)).toEqual({ totalPages: 1, currentPage: 1, from: 1, to: 0 })
  })
})

describe('resultCountText', () => {
  it('uses the live wording for one, all, and a range', () => {
    expect(resultCountText(1, 1, 1)).toBe('מציג תוצאה יחידה')
    expect(resultCountText(13, 1, 13)).toBe('מציגים את כל ⁦13⁩ התוצאות')
    expect(resultCountText(46, 1, 24)).toBe('מציג 1–24 מתוך 46 תוצאות')
    expect(resultCountText(46, 25, 46)).toBe('מציג 25–46 מתוך 46 תוצאות')
  })

  it('says "all" once a continuous grid has reached the last card', () => {
    expect(resultCountText(46, 1, 46)).toBe('מציגים את כל ⁦46⁩ התוצאות')
  })
})

describe('archivePageUrl', () => {
  it('sends the shop archive with no slug and the page replaced', () => {
    const url = new URL(archivePageUrl('/products', '?sort=price_asc&page=1', 2), 'http://x')
    expect(url.pathname).toBe(ARCHIVE_PAGE_ENDPOINT)
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('sort')).toBe('price_asc')
    expect(url.searchParams.has('slug')).toBe(false)
  })

  it('turns a category pathname into the slug parameter and keeps every filter', () => {
    const url = new URL(
      archivePageUrl('/category/spa', '?min=50&max=200&type=voucher&city=haifa&near=32.1,34.8', 3),
      'http://x',
    )
    expect(url.searchParams.get('slug')).toBe('spa')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('min')).toBe('50')
    expect(url.searchParams.get('max')).toBe('200')
    expect(url.searchParams.get('type')).toBe('voucher')
    expect(url.searchParams.get('city')).toBe('haifa')
    expect(url.searchParams.get('near')).toBe('32.1,34.8')
  })

  it('decodes an escaped slug once, so the route reads what the page read', () => {
    const url = new URL(archivePageUrl('/category/hot%2Ddeals', '', 2), 'http://x')
    expect(url.searchParams.get('slug')).toBe('hot-deals')
  })

  it('drops a slug the query string tries to smuggle in on the shop archive', () => {
    const url = new URL(archivePageUrl('/products', '?slug=spa', 2), 'http://x')
    expect(url.searchParams.has('slug')).toBe(false)
  })
})
