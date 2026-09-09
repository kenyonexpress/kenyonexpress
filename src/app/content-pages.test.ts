import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILT_IN_PAGES, type BuiltInPageSlug } from '@/lib/content/pages'
import { contentSitemapEntries } from '@/lib/seo/sitemap-sections'
import { describe, expect, it } from 'vitest'

/**
 * The new content pages sit inside the measured template.
 *
 * WHY THIS IS A TEST AND NOT A `compare.mjs` RUN. That script scores a local
 * page against the LIVE WordPress site, pixel by pixel. `/about`, `/suppliers`
 * and `/blog` do not exist on the live site, so there is no counterpart to
 * score against and any number the script produced would be a comparison
 * between two unrelated pages - which is exactly the mistake [69] found when
 * the search page's 14.41% turned out not to be a fidelity measurement at all.
 *
 * What CAN be checked is the thing the gate is actually protecting: that a new
 * page does not invent a third rhythm. `/faq` was measured against the
 * template and passed, so its frame is the reference, and these assertions say
 * the new pages use the same one.
 *
 * A page that legitimately needs a different frame will fail this and should -
 * at which point somebody decides deliberately, which is the point.
 */

const APP = join(process.cwd(), 'src', 'app', '(store)')

function source(...segments: string[]): string {
  return readFileSync(join(APP, ...segments), 'utf8')
}

/** The container `/faq` uses, and the one the comparison gate has seen. */
const PAGE_FRAME = 'mx-auto w-full max-w-page px-4 py-10'

/** The reading measure for body copy on every content page. */
const BODY_MEASURE = 'max-w-3xl'

const PAGES: [name: string, path: string[]][] = [
  ['faq', ['faq', 'page.tsx']],
  ['about', ['about', 'page.tsx']],
  ['suppliers', ['suppliers', 'page.tsx']],
  ['blog layout', ['blog', 'layout.tsx']],
]

describe('content pages share the measured frame', () => {
  for (const [name, path] of PAGES) {
    it(`${name} uses the same page container as /faq`, () => {
      expect(source(...path)).toContain(PAGE_FRAME)
    })
  }

  for (const [name, path] of PAGES) {
    it(`${name} keeps body copy at the same measure`, () => {
      expect(source(...path)).toContain(BODY_MEASURE)
    })
  }
})

describe('content pages carry the SEO fields a crawler needs', () => {
  const WITH_METADATA: [string, string[]][] = [
    ['about', ['about', 'page.tsx']],
    ['suppliers', ['suppliers', 'page.tsx']],
    ['blog index', ['blog', 'page.tsx']],
  ]

  for (const [name, path] of WITH_METADATA) {
    it(`${name} declares a canonical URL`, () => {
      // Without it, a page reachable at both /about and /about/ is two pages to
      // a crawler and neither ranks.
      const text = source(...path)
      expect(text).toContain('alternates:')
      expect(text).toContain('canonical:')
    })
  }

  /**
   * The description is asserted on the VALUE, not on the source text.
   *
   * It used to be `expect(source).toMatch(/description:\s*\n?\s*'/)`, which
   * required the string to be a literal in the file. [58] moved /about and
   * /suppliers onto the CMS, so their description is now `seoDescription` from
   * the page row with the body's excerpt behind it - and the old assertion
   * failed on two pages whose descriptions had got BETTER, while it would still
   * have passed on `description: ''`.
   *
   * `/blog` is not a content page and keeps its literal, so it is checked the
   * way it is written.
   */
  const CMS_BACKED: [string, BuiltInPageSlug][] = [
    ['about', 'about'],
    ['suppliers', 'supplier-signup'],
    ['contact', 'contact'],
    ['faq', 'faq'],
    ['how-it-works', 'how-it-works'],
  ]

  for (const [name, slug] of CMS_BACKED) {
    it(`${name} ships a description long enough to be used as one`, () => {
      const description = BUILT_IN_PAGES[slug].seoDescription
      // 205's CHECK refuses a stored override under 20 characters. The built-in
      // is what a page falls back to before any row exists, so it is held to
      // the same floor.
      expect(description).toBeTruthy()
      expect((description ?? '').length).toBeGreaterThanOrEqual(20)
    })
  }

  it('blog keeps its literal description, being the one page with no CMS row', () => {
    expect(source('blog', 'page.tsx')).toMatch(/description:\s*\n?\s*'/)
  })
})

describe('the new pages are reachable', () => {
  it('are all linked from the footer, not only from the sitemap', () => {
    // A page in the sitemap and nowhere else is a page Google finds and a
    // customer does not.
    const footer = readFileSync(
      join(process.cwd(), 'src', 'components', 'layout', 'SiteFooter.tsx'),
      'utf8',
    )
    expect(footer).toContain("href: '/about'")
    expect(footer).toContain("href: '/suppliers'")
    expect(footer).toContain("href: '/blog'")
  })

  it('are all in the sitemap', () => {
    // Asked of the URLs the content section actually emits, not of the text of
    // the file that emits them. The old form read `app/sitemap.ts` as a string
    // and `toContain('/about')` would have passed on a commented-out entry, or
    // on the word appearing anywhere in three hundred lines of prose.
    const paths = contentSitemapEntries('https://example.test', undefined).map((entry) =>
      entry.url.slice('https://example.test'.length),
    )
    expect(paths).toContain('/about')
    expect(paths).toContain('/suppliers')
    expect(paths).toContain('/blog')
  })
})
