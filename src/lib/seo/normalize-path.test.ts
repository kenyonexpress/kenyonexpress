import { describe, expect, it } from 'vitest'
import { normalizePath } from './normalize-path'

/**
 * normalizePath is a contract shared by three implementations that must agree
 * exactly: this one (read side, in the proxy), the JS in
 * scripts/wp-import/02-transform.mjs (write side, deciding rows), and the SQL
 * in wp_import.fn_project_redirects (write side, projecting them).
 *
 * When they drift, nothing errors. Rows are written that no request can ever
 * match, and every old URL 404s exactly as if no redirect had been configured
 * at all. These tests are the only thing that makes that drift loud.
 */
describe('normalizePath', () => {
  it('strips a trailing slash, which WordPress permalinks always carry', () => {
    expect(normalizePath('/product/foo/')).toBe('/product/foo')
    expect(normalizePath('/product/foo')).toBe('/product/foo')
    expect(normalizePath('/product/foo///')).toBe('/product/foo')
  })

  it('keeps the root as /', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })

  it('lowercases', () => {
    expect(normalizePath('/Product/Foo')).toBe('/product/foo')
  })

  it('drops query and fragment', () => {
    expect(normalizePath('/product/foo?utm_source=x')).toBe('/product/foo')
    expect(normalizePath('/product/foo#reviews')).toBe('/product/foo')
  })

  it('percent-decodes a Hebrew slug to the form the importer stores', () => {
    // This is the single most common shape in this catalogue: WordPress writes
    // post_name percent-encoded, and the importer stores the decoded form.
    expect(normalizePath('/product/%d7%90%d7%a8%d7%95%d7%97%d7%94')).toBe('/product/ארוחה')
  })

  it('NFC-folds Hebrew so composed and decomposed encodings are one path', () => {
    // Same visible word, two byte strings. Without NFC these never compare
    // equal and the redirect silently never fires.
    const composed = '/product/שׁ'
    const decomposed = '/product/שׁ'.normalize('NFD')
    expect(normalizePath(decomposed)).toBe(normalizePath(composed))
  })

  it('does not throw on a malformed percent sequence', () => {
    // A bad legacy URL still deserves a lookup rather than a 500 from inside
    // middleware, which would take down the page for every visitor.
    expect(() => normalizePath('/product/%zz')).not.toThrow()
    expect(normalizePath('/product/%zz')).toBe('/product/%zz')
  })

  it('is idempotent', () => {
    const once = normalizePath('/Product/%D7%90/')
    expect(normalizePath(once)).toBe(once)
  })
})
