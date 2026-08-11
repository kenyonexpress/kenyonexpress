import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

    it(`${name} declares a description`, () => {
      expect(source(...path)).toMatch(/description:\s*\n?\s*'/)
    })
  }
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
    const sitemap = readFileSync(join(process.cwd(), 'src', 'app', 'sitemap.ts'), 'utf8')
    expect(sitemap).toContain('/about')
    expect(sitemap).toContain('/suppliers')
    expect(sitemap).toContain('/blog')
  })
})
