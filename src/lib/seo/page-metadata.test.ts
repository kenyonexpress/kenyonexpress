import {
  HREFLANG,
  OG_LOCALE,
  ROOT_OG_IMAGE,
  SITE_NAME,
  canonicalPath,
  hreflangAlternates,
  publicPageMetadata,
} from '@/lib/seo/page-metadata'
import { describe, expect, it } from 'vitest'

describe('canonicalPath', () => {
  it('drops query strings and fragments', () => {
    expect(canonicalPath('/category/spa?sort=price&page=2#top')).toBe('/category/spa')
  })

  it('keeps the root as a single slash and strips trailing slashes elsewhere', () => {
    expect(canonicalPath('/')).toBe('/')
    expect(canonicalPath('/about/')).toBe('/about')
    expect(canonicalPath('about')).toBe('/about')
  })

  it('leaves an encoded Hebrew segment alone', () => {
    const encoded = `/product/${encodeURIComponent('קופון-ספא')}`
    expect(canonicalPath(encoded)).toBe(encoded)
  })
})

describe('hreflangAlternates', () => {
  it('points he-IL and x-default at the canonical', () => {
    expect(hreflangAlternates('/faq')).toEqual({
      canonical: '/faq',
      languages: { [HREFLANG]: '/faq', 'x-default': '/faq' },
    })
  })

  it('canonicalises the path it is given', () => {
    const alternates = hreflangAlternates('/products?page=3')
    expect(alternates.canonical).toBe('/products')
    expect(alternates.languages?.['he-IL']).toBe('/products')
    expect(alternates.languages?.['x-default']).toBe('/products')
  })
})

describe('publicPageMetadata', () => {
  const meta = publicPageMetadata({
    title: 'שאלות נפוצות',
    description: 'תשובות',
    path: '/faq',
  })

  it('sets the title and description', () => {
    expect(meta.title).toBe('שאלות נפוצות')
    expect(meta.description).toBe('תשובות')
  })

  it('carries canonical and the hreflang pair', () => {
    expect(meta.alternates).toEqual(hreflangAlternates('/faq'))
  })

  it('repeats siteName and locale in openGraph, because a page-level openGraph replaces the root one', () => {
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALE,
      title: 'שאלות נפוצות',
      description: 'תשובות',
      url: '/faq',
    })
  })

  it('sets a large-image Twitter card with the same title and description', () => {
    expect(meta.twitter).toEqual({
      card: 'summary_large_image',
      title: 'שאלות נפוצות',
      description: 'תשובות',
      images: [ROOT_OG_IMAGE],
    })
  })

  it('claims the root card by default, because a page-level openGraph loses the inherited one', () => {
    // Measured on the first served audit: every page with its own openGraph
    // block had no og:image at all; only /product, which has a card file in
    // its own segment, kept one.
    expect(meta.openGraph).toMatchObject({ images: [ROOT_OG_IMAGE] })
    expect(meta.twitter).toMatchObject({ images: [ROOT_OG_IMAGE] })
  })

  it('claims no image for a segment with its own card file', () => {
    // The product page: naming any image here, even the root card, would hide
    // its generated price card.
    const own = publicPageMetadata({
      title: 't',
      description: 'd',
      path: '/product/x',
      ownCard: true,
    })
    expect(own.openGraph).not.toHaveProperty('images')
    expect(own.twitter).not.toHaveProperty('images')
  })

  it('passes an explicit image to both cards', () => {
    const withImage = publicPageMetadata({
      title: 't',
      description: 'd',
      path: '/x',
      image: '/images/x.png',
    })
    expect(withImage.openGraph).toMatchObject({ images: ['/images/x.png'] })
    expect(withImage.twitter).toMatchObject({ images: ['/images/x.png'] })
  })

  it('builds an article card with its dates', () => {
    const article = publicPageMetadata({
      title: 'פוסט',
      description: 'תקציר',
      path: '/blog/how-coupons-work',
      type: 'article',
      publishedTime: '2026-08-10',
      modifiedTime: '2026-09-01',
    })
    expect(article.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-08-10',
      modifiedTime: '2026-09-01',
      siteName: SITE_NAME,
      locale: OG_LOCALE,
    })
  })

  it('does not leave undefined keys that would serialise as empty tags', () => {
    const og = meta.openGraph as Record<string, unknown>
    for (const [key, value] of Object.entries(og)) {
      expect(value, key).not.toBeUndefined()
    }
  })
})
