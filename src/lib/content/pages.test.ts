import { parseBlocks } from '@/lib/content/markup'
import {
  BUILT_IN_PAGES,
  BUILT_IN_PAGE_SLUGS,
  CONTENT_SLUG_PATTERN,
  RESERVED_CONTENT_SLUGS,
  contentPageHref,
} from '@/lib/content/pages'
import { contentSitemapEntries } from '@/lib/seo/sitemap-sections'
import { describe, expect, it } from 'vitest'

describe('contentPageHref', () => {
  it('serves a bound page at the address it already had', () => {
    expect(contentPageHref({ slug: 'about', boundRoute: '/about' })).toBe('/about')
  })

  it('serves an unbound page under /page/', () => {
    expect(contentPageHref({ slug: 'how-it-works', boundRoute: null })).toBe('/page/how-it-works')
  })
})

describe('the built-in pages', () => {
  it('are the five the section names', () => {
    expect(BUILT_IN_PAGE_SLUGS.sort()).toEqual([
      'about',
      'contact',
      'faq',
      'how-it-works',
      'supplier-signup',
    ])
  })

  it('bind the four that already have an address, and only those', () => {
    const bound = Object.values(BUILT_IN_PAGES)
      .filter((page) => page.boundRoute !== null)
      .map((page) => page.boundRoute)
      .sort()
    // Four existing addresses. A fifth would mean a page answering at two URLs,
    // which is the duplicate content `boundRoute` exists to prevent.
    expect(bound).toEqual(['/about', '/contact', '/faq', '/suppliers'])
  })

  it('never binds under /page/, which would be the duplicate spelled long', () => {
    for (const page of Object.values(BUILT_IN_PAGES)) {
      expect(page.boundRoute?.startsWith('/page/') ?? false).toBe(false)
    }
  })

  it('all carry slugs the database CHECK would accept', () => {
    for (const slug of BUILT_IN_PAGE_SLUGS) {
      expect(CONTENT_SLUG_PATTERN.test(slug)).toBe(true)
    }
  })

  it('reserve their own slugs plus `page`, so none can be recreated', () => {
    // `page` would produce `/page/page`; the rest already exist and are edited
    // rather than created again.
    expect(RESERVED_CONTENT_SLUGS).toContain('page')
    for (const slug of BUILT_IN_PAGE_SLUGS) {
      expect(RESERVED_CONTENT_SLUGS).toContain(slug)
    }
  })

  it('ship prose that parses to something, not an empty body', () => {
    for (const page of Object.values(BUILT_IN_PAGES)) {
      if (page.body.kind === 'prose') {
        expect(parseBlocks(page.body.markup).length).toBeGreaterThan(0)
      } else {
        expect(page.body.entries.length).toBeGreaterThan(0)
      }
    }
  })

  it('reassembles /about from the module that used to render it', () => {
    const about = BUILT_IN_PAGES.about
    expect(about.body.kind).toBe('prose')
    if (about.body.kind !== 'prose') return
    const blocks = parseBlocks(about.body.markup)
    // Intro paragraph first, then a heading per section: the shape the page
    // rendered by hand before the body became one string.
    expect(blocks[0]?.kind).toBe('paragraph')
    expect(blocks.filter((block) => block.kind === 'heading').length).toBeGreaterThanOrEqual(4)
  })
})

describe('the content sitemap section', () => {
  const BASE = 'https://example.test'
  const paths = (pages: { path: string; updatedAt: string | null }[] = []) =>
    contentSitemapEntries(BASE, undefined, pages).map((entry) => entry.url.slice(BASE.length))

  it('lists an unbound page at its /page/ address', () => {
    expect(paths([{ path: '/page/how-it-works', updatedAt: null }])).toContain('/page/how-it-works')
  })

  it('does not list /about twice when a row is bound to it', () => {
    // The whole reason the merge dedupes. `/about` is a fixed entry AND a
    // content page, and a sitemap that lists one URL twice is reported by
    // Search Console as containing errors.
    const listed = paths([{ path: '/about', updatedAt: '2026-09-01T00:00:00.000Z' }])
    expect(listed.filter((path) => path === '/about')).toHaveLength(1)
  })

  it('keeps the per-page priority rather than flattening it', () => {
    // /suppliers is 0.7 because a business is worth more than a session. An
    // appended generated entry would have replaced that with the default.
    const entries = contentSitemapEntries(BASE, undefined, [
      { path: '/suppliers', updatedAt: '2026-09-01T00:00:00.000Z' },
    ])
    expect(entries.find((entry) => entry.url.endsWith('/suppliers'))?.priority).toBe(0.7)
  })

  it('publishes a lastmod for a fixed page once the CMS knows one', () => {
    const before = contentSitemapEntries(BASE, undefined).find((entry) =>
      entry.url.endsWith('/contact'),
    )
    // Before there is a row there is no signal, and omitting it says "I do not
    // know", which is true. A row is that signal.
    expect(before?.lastModified).toBeUndefined()

    const after = contentSitemapEntries(BASE, undefined, [
      { path: '/contact', updatedAt: '2026-09-01T00:00:00.000Z' },
    ]).find((entry) => entry.url.endsWith('/contact'))
    expect(after?.lastModified?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('emits nothing extra when no page rows are passed', () => {
    expect(paths()).toEqual(paths([]))
  })
})
