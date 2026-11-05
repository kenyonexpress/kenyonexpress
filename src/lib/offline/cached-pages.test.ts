import { describe, expect, it } from 'vitest'
import { cachedPageLinks, labelFromSlug } from './cached-pages'

const ORIGIN = 'https://www.kenyonexpress.co.il'

describe('cachedPageLinks', () => {
  it('lists product and category documents newest first, with readable labels', () => {
    const links = cachedPageLinks(
      [
        `${ORIGIN}/`,
        `${ORIGIN}/product/launch-italian-dinner-tlv`,
        `${ORIGIN}/category/vacation`,
        `${ORIGIN}/product/%D7%A6%D7%99%D7%9E%D7%A8-%D7%9E%D7%90%D7%A1%D7%98%D7%A8`,
      ],
      ORIGIN,
    )
    expect(links).toEqual([
      // The href keeps the percent-encoding the cache key carries; only the label is decoded.
      {
        href: '/product/%D7%A6%D7%99%D7%9E%D7%A8-%D7%9E%D7%90%D7%A1%D7%98%D7%A8',
        label: 'צימר מאסטר',
        kind: 'product',
      },
      { href: '/category/vacation', label: 'vacation', kind: 'category' },
      {
        href: '/product/launch-italian-dinner-tlv',
        label: 'launch italian dinner tlv',
        kind: 'product',
      },
    ])
  })

  it('skips other origins, query strings, nested paths, the home page and duplicates', () => {
    const links = cachedPageLinks(
      [
        'https://evil.example/product/x',
        `${ORIGIN}/product/x?utm=1`,
        `${ORIGIN}/product/x/extra`,
        `${ORIGIN}/`,
        `${ORIGIN}/product/x`,
        `${ORIGIN}/product/x`,
        'not a url',
      ],
      ORIGIN,
    )
    expect(links).toEqual([{ href: '/product/x', label: 'x', kind: 'product' }])
  })

  it('caps the list and keeps the catalogue as its own kind', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `${ORIGIN}/product/p${i}`)
    urls.push(`${ORIGIN}/products`)
    const links = cachedPageLinks(urls, ORIGIN, 5)
    expect(links).toHaveLength(5)
    expect(links[0]).toEqual({ href: '/products', label: '', kind: 'catalogue' })
  })

  it('labels a slug without inventing anything, and survives a bad percent sequence', () => {
    expect(labelFromSlug('arukha-zugit_italkit')).toBe('arukha zugit italkit')
    expect(labelFromSlug('%E0%A4%A')).toBe('%E0%A4%A')
  })
})
