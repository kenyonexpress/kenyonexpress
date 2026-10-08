import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `/merchants` (STEP 63), read from the sources. Server pages are not
 * rendered in this suite (see overview.test.ts), and the directory's data
 * module has its own unit tests; this file holds the things that would each
 * fail silently:
 *
 *   1. the business rule: no rating, star or review word reaches the page
 *      or its data module (migration 232 ended public display of ratings);
 *   2. every card is a link into `/s/[id]`, the page that holds the facts;
 *   3. the route is registered everywhere a static public route must be:
 *      sitemap, the SEO audit, the smoke and render-mode suites, and the
 *      legacy redirect map, with no 410 row able to shadow it;
 *   4. the two supplier-facing pages link to it, so it is reachable without
 *      the footer (which was left alone for the 380px parity margin).
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
/** Source with comments stripped, so a "why not" note cannot trip a word ban. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

const PAGE = 'src/app/(store)/merchants/page.tsx'
const LIB = 'src/lib/merchant-directory.ts'

describe('/merchants hides ratings', () => {
  for (const file of [PAGE, LIB]) {
    it(`${file} carries no rating, star or review`, () => {
      const src = code(file)
      expect(src).not.toMatch(/rating/i)
      expect(src).not.toMatch(/aggregateRating/)
      expect(src).not.toMatch(/\breviews?\b/i)
      expect(src).not.toMatch(/\bstars?\b/i)
      expect(src).not.toMatch(/דירוג|כוכב|ביקור/)
    })
  }

  it('the data module never touches the reviews table', () => {
    expect(code(LIB)).not.toMatch(/from\(\s*'reviews'/)
  })
})

describe('/merchants cards', () => {
  it('link into the supplier storefront and the category archive', () => {
    const page = code(PAGE)
    expect(page).toContain('`/s/${merchant.id}`')
    expect(page).toContain('`/category/${encodeURIComponent(category.slug)}`')
  })

  it('show logo, category, city and coupon count, through the data module', () => {
    const page = code(PAGE)
    expect(page).toContain('merchant.logoUrl')
    expect(page).toContain('merchant.categories')
    expect(page).toContain('merchant.city')
    expect(page).toContain('couponCountLabel(merchant.couponCount)')
    expect(page).toContain("from '@/lib/merchant-directory'")
  })

  it('serve the logo through the optimizer, never a raw img', () => {
    const page = code(PAGE)
    expect(page).toContain("from 'next/image'")
    expect(page).not.toMatch(/<img\b/)
  })

  it('publish a breadcrumb and an item list, and no other schema type', () => {
    const page = code(PAGE)
    expect(page).toContain('buildBreadcrumbJsonLd(')
    expect(page).toContain('buildItemListJsonLd(')
    expect(page).not.toMatch(/LocalBusiness|Organization|Product'/)
  })
})

describe('/merchants is registered', () => {
  it('in the sitemap', () => {
    expect(read('src/app/sitemap.ts')).toContain('`${base}/merchants`')
  })

  it('in the SEO audit, the smoke suite and the render-mode suite', () => {
    expect(read('scripts/seo/audit.mjs')).toContain("'/merchants'")
    expect(read('e2e/smoke-all-routes.spec.ts')).toContain("'/merchants'")
    expect(read('e2e/render-mode.spec.ts')).toContain("'/merchants'")
  })

  it('is not disallowed for crawlers, and the till prefix does not swallow it', () => {
    const robots = read('src/app/robots.ts')
    expect(robots).not.toContain("'/merchants")
    // `/merchant/` with the trailing slash: a bare `/merchant` would also
    // match `/merchants` in robots.txt prefix matching.
    expect(robots).toContain("'/merchant/'")
  })

  it('is a live static route in the legacy redirect map, with no 410 row', () => {
    const map = JSON.parse(read('data/legacy/redirect-map.json')) as {
      $targets: { static_routes: string[] }
      redirects: { source: string; status: number }[]
    }
    expect(map.$targets.static_routes).toContain('/merchants')
    expect(map.redirects.find((r) => r.source === '/merchants')).toBeUndefined()
  })
})

describe('/merchants is reachable', () => {
  it('from the supplier storefront and from the join-us page', () => {
    expect(read('src/app/(store)/s/[id]/page.tsx')).toContain('href="/merchants"')
    expect(read('src/app/(store)/suppliers/page.tsx')).toContain('href="/merchants"')
  })
})
