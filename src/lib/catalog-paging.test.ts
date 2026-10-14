import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATALOG_PAGING_KEY,
  CATALOG_PAGING_LABELS,
  DEFAULT_CATALOG_PAGING,
  RESTORE_MAX_PAGES,
  clearScrollDepth,
  parseCatalogPaging,
  readScrollDepth,
  readStoredCatalogPaging,
  scrollDepthKey,
  writeScrollDepth,
  writeStoredCatalogPaging,
} from './catalog-paging'

/**
 * The paging preference (UX22) and the per-URL depth memory. Pinned: the
 * numbered pages are the default and every unknown value, the default is
 * stored as an absence, and the depth is a session value keyed by the whole
 * archive URL so two filtered views never share one.
 */
describe('catalog paging preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('reads the numbered pages for anything that is not exactly "scroll"', () => {
    expect(parseCatalogPaging('scroll')).toBe('scroll')
    expect(parseCatalogPaging('pages')).toBe('pages')
    expect(parseCatalogPaging('SCROLL')).toBe('pages')
    expect(parseCatalogPaging(null)).toBe('pages')
    expect(parseCatalogPaging(undefined)).toBe('pages')
    expect(parseCatalogPaging(42)).toBe('pages')
    expect(DEFAULT_CATALOG_PAGING).toBe('pages')
  })

  it('stores continuous loading under the versioned key and the default as an absence', () => {
    writeStoredCatalogPaging('scroll')
    expect(window.localStorage.getItem(CATALOG_PAGING_KEY)).toBe('scroll')
    expect(readStoredCatalogPaging()).toBe('scroll')

    writeStoredCatalogPaging('pages')
    expect(window.localStorage.getItem(CATALOG_PAGING_KEY)).toBeNull()
    expect(readStoredCatalogPaging()).toBe('pages')
  })

  it('names both modes in Hebrew', () => {
    expect(CATALOG_PAGING_LABELS.pages).toBe('עמודים')
    expect(CATALOG_PAGING_LABELS.scroll).toBe('גלילה רציפה')
  })
})

describe('scroll depth memory', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('keys the depth by pathname and query, so a filtered view has its own', () => {
    expect(scrollDepthKey('/products', '')).not.toBe(scrollDepthKey('/products', '?sort=price_asc'))
    expect(scrollDepthKey('/category/spa', '?min=50')).toContain('/category/spa?min=50')
  })

  it('remembers a depth past page one in session storage and forgets page one', () => {
    const key = scrollDepthKey('/products', '')
    writeScrollDepth(key, 3)
    expect(readScrollDepth(key)).toBe(3)
    expect(window.sessionStorage.getItem(key)).toBe('3')

    writeScrollDepth(key, 1)
    expect(readScrollDepth(key)).toBeNull()
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })

  it('ignores a corrupt entry and clears on request', () => {
    const key = scrollDepthKey('/products', '')
    window.sessionStorage.setItem(key, 'deep')
    expect(readScrollDepth(key)).toBeNull()
    window.sessionStorage.setItem(key, '4')
    clearScrollDepth(key)
    expect(readScrollDepth(key)).toBeNull()
  })

  it('caps the refill', () => {
    expect(RESTORE_MAX_PAGES).toBeGreaterThan(1)
    expect(RESTORE_MAX_PAGES).toBeLessThanOrEqual(10)
  })
})
