import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY PUBLIC PAGE DECLARES ITS OWN ADDRESS, OR SAYS IT SHOULD NOT BE INDEXED.
 *
 * MEASURED 2026-09-10, against the built server rather than the source:
 *
 *   /login  ->  <link rel="canonical" href="https://kenyonexpress.co.il">
 *   /cart   ->  <link rel="canonical" href="https://kenyonexpress.co.il">
 *   /search ->  the same, plus noindex
 *
 * `src/app/layout.tsx` declares `alternates.canonical: '/'`, Next inherits
 * metadata down the tree, and so **sixteen public routes told Google they were
 * the home page**. A canonical is not a hint about crawl priority: it names the
 * one URL that should represent a piece of content, and sixteen pages claiming
 * the home page's URL is a duplicate-content signal aimed at the most valuable
 * page on the site.
 *
 * `/login` was the clearest case, because `robots.txt` does not disallow it -
 * only `/auth/`, `/reset-password` and `/forgot-password` - so it was crawlable,
 * indexable and claiming to be the home page at the same time.
 *
 * THE TWO FIXES ARE DIFFERENT AND THE DISTINCTION IS THE POINT. A transactional
 * or auth page gets `robots: { index: false }`, because it has no business in an
 * index at all. A content page gets its OWN canonical - `/coupons/[id]` and
 * `/suppliers/apply` are pages somebody should be able to find, so noindex would
 * have been the lazy fix and the wrong one.
 *
 * WHY NOT JUST DELETE THE ROOT CANONICAL. Because then the home page has none,
 * and the root layout is the only place it can be declared for `/` itself. It
 * stays, and this test is what stops the next page inheriting it silently.
 */

const APP = resolve(process.cwd(), 'src/app')

/** The literal the root layout declares, and the one a page must not repeat. */
const SITE_ROOT_CANONICAL = "'/'"

/** The route groups a search engine can reach. `(admin)` and `(supplier)` are behind a session. */
const PUBLIC_GROUPS = [
  '(main)',
  '(shop)',
  '(store)',
  '(marketing)',
  '(legal)',
  '(supplier-public)',
  '(auth)',
]

function pages(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) pages(full, out)
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

const publicPages = PUBLIC_GROUPS.flatMap((group) => pages(join(APP, group)))

describe('canonical coverage', () => {
  it('finds the public pages, so a restructure cannot empty this test', () => {
    expect(publicPages.length).toBeGreaterThanOrEqual(30)
  })

  it('gives every public page either its own canonical or a noindex', () => {
    const inheriting = publicPages
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        const declaresCanonical = /canonical:/.test(source)
        const declaresNoindex = /index:\s*false/.test(source)
        // A redirect stub renders no HTML, so it emits no canonical to inherit.
        // Derived rather than listed: the four `(legal)/legal/*` routes are
        // 308s to the paths that hold the binding text, and a list would go
        // stale the day one of them becomes a page again.
        const isRedirectStub =
          /\b(?:permanentRedirect|redirect)\(/.test(source) && !source.includes('return (')
        return !declaresCanonical && !declaresNoindex && !isRedirectStub
      })
      .map((file) => relative(process.cwd(), file))

    expect(
      inheriting,
      "public pages inheriting alternates.canonical: '/' from the root layout -- add a canonical of their own, or robots: { index: false } if they should not be indexed",
    ).toEqual([])
  })

  it("never leaves a noindex page carrying somebody else's canonical", () => {
    // The pair Google resolves in the dangerous direction: noindex plus a
    // canonical pointing at another url means the noindex can be applied to the
    // TARGET. Every one of these inherited `canonical: '/'` from the root layout
    // until 2026-09-10, so fourteen pages were telling a crawler not to index the
    // home page.
    const wrong = publicPages
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        if (!/index:\s*false/.test(source)) return false
        // Any canonical of its own counts, literal or computed: three of these
        // pages build it from the slug. What fails is declaring none at all, or
        // declaring the site root. The rule is per FILE, because a page whose
        // not-found branch returns early still inherits from the layout and the
        // file is where somebody will look.
        const declared = source.match(/alternates:\s*\{\s*canonical:\s*([^,}]+)/)
        const value = declared?.[1]?.trim()
        return !value || value === SITE_ROOT_CANONICAL
      })
      .map((file) => relative(process.cwd(), file))

    expect(
      wrong,
      "noindex pages with no canonical of their own -- they inherit the root layout's, which points at the home page",
    ).toEqual([])
  })

  it('keeps the root layout as the only place the home page canonical lives', () => {
    const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/canonical:\s*'\/'/)
  })

  it('does not noindex a page that is in the sitemap', () => {
    // The contradiction worth catching: a route listed in the sitemap and told
    // not to be indexed says two opposite things to the same crawler. The
    // sitemap sections are built from the DB, so this checks the static list.
    const sitemap = readFileSync(resolve(process.cwd(), 'src/lib/seo/sitemap-sections.ts'), 'utf8')
    for (const route of ['/cart', '/checkout', '/login', '/signup']) {
      expect(sitemap, `${route} is both in the sitemap and noindex`).not.toContain(`'${route}'`)
    }
  })
})
