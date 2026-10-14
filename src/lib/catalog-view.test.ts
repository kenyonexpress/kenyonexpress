import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATALOG_VIEW_KEY,
  parseCatalogView,
  readStoredCatalogView,
  writeStoredCatalogView,
} from './catalog-view'

/**
 * The preference store behind the grid / list switcher (UX14). The parse rule
 * is the whole contract: `list` is the list and everything else, including a
 * value a future version wrote, is the grid.
 */
describe('catalog view preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reads list and treats every other value as the grid', () => {
    expect(parseCatalogView('list')).toBe('list')
    expect(parseCatalogView('grid')).toBe('grid')
    expect(parseCatalogView('LIST')).toBe('grid')
    expect(parseCatalogView(null)).toBe('grid')
    expect(parseCatalogView(undefined)).toBe('grid')
    expect(parseCatalogView(42)).toBe('grid')
  })

  it('defaults to the grid when nothing is stored', () => {
    expect(readStoredCatalogView()).toBe('grid')
  })

  it('stores the list and reads it back', () => {
    writeStoredCatalogView('list')
    expect(window.localStorage.getItem(CATALOG_VIEW_KEY)).toBe('list')
    expect(readStoredCatalogView()).toBe('list')
  })

  it('stores the default as an absence, so a shopper who went back leaves no key', () => {
    writeStoredCatalogView('list')
    writeStoredCatalogView('grid')
    expect(window.localStorage.getItem(CATALOG_VIEW_KEY)).toBeNull()
    expect(readStoredCatalogView()).toBe('grid')
  })

  it('reads a corrupt stored value as the grid', () => {
    window.localStorage.setItem(CATALOG_VIEW_KEY, '{"view":"list"}')
    expect(readStoredCatalogView()).toBe('grid')
  })
})
