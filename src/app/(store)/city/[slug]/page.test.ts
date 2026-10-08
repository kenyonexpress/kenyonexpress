import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CITIES } from '@/lib/geo/cities'
import { REGIONS } from '@/lib/regions'
import { describe, expect, it } from 'vitest'

/**
 * `/city/[slug]` (STEP 64), read from the sources. Server pages are not
 * rendered in this suite (see overview.test.ts) and the data module has its
 * own unit tests; this file holds the things that would each fail silently:
 *
 *   1. the business rule: no rating, star or review word reaches the page or
 *      its data module (migration 232 ended public display of ratings);
 *   2. the local-SEO frame: metadata through the shared helper, a breadcrumb,
 *      a `Place` for the city, an `ItemList` for the deals, no `LocalBusiness`
 *      (the database holds no street address to back one);
 *   3. every slug the route prerenders is one the sitemap lists, and the
 *      region menu's seventeen hrefs still resolve;
 *   4. the pages are reachable: the product page's city tag, the merchant
 *      directory's city line and the region chips all point here.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
/** Source with comments stripped, so a "why not" note cannot trip a word ban. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')

const PAGE = 'src/app/(store)/city/[slug]/page.tsx'
const LIB = 'src/lib/city-page.ts'

describe('/city/[slug] hides ratings', () => {
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

  it('the data module never touches the reviews or branches tables', () => {
    expect(code(LIB)).not.toMatch(/from\(\s*'reviews'/)
    expect(code(LIB)).not.toMatch(/from\(\s*'supplier_branches'/)
  })
})

describe('/city/[slug] frame', () => {
  it('resolves both slug kinds through the data module and prerenders all of them', () => {
    const page = code(PAGE)
    expect(page).toContain("from '@/lib/city-page'")
    expect(page).toContain('resolveCityPage(decodeURIComponent(slug))')
    expect(page).toContain('allCityPageSlugs().map((slug) => ({ slug }))')
    expect(page).toContain('export function generateStaticParams')
  })

  it('declares its head through the shared helper, with a noindex for an unknown slug', () => {
    const page = code(PAGE)
    expect(page).toContain("from '@/lib/seo/page-metadata'")
    expect(page).toContain('publicPageMetadata(')
    expect(page).toContain('cityPageTitle(name)')
    expect(page).toContain('cityPageDescription(name)')
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/)
  })

  it('publishes a breadcrumb, a Place for the city and an ItemList for the deals, never a LocalBusiness', () => {
    const page = code(PAGE)
    expect(page).toContain('buildBreadcrumbJsonLd(')
    expect(page).toContain('buildItemListJsonLd(')
    expect(page).toContain("'@type': 'Place'")
    expect(page).toContain("'@type': 'GeoCoordinates'")
    expect(page).toContain("addressCountry: 'IL'")
    expect(page).not.toMatch(/LocalBusiness|Organization/)
    // The Place carries the municipal coordinate, nothing invented.
    expect(page).toContain('latitude: target.city.lat')
    expect(page).toContain('longitude: target.city.lng')
  })

  it('renders the same product card as the category archive, with pagination', () => {
    const page = code(PAGE)
    expect(page).toContain("from '@/components/category/CategoryProductCard'")
    expect(page).toContain("from '@/components/category/Pagination'")
    expect(page).toContain('pageOfDeals(deals, page)')
    expect(page).toContain('<Suspense')
  })

  it('links merchants into the storefront, categories into the archive, cities into each other', () => {
    const page = code(PAGE)
    expect(page).toContain('`/s/${merchant.id}`')
    expect(page).toContain('`/category/${encodeURIComponent(category.slug)}`')
    expect(page).toContain('cityPageHref(city.slug)')
    expect(page).toContain('cityPageHref(target.region.slug)')
    // The old region page bounced into the filtered catalogue; the city page
    // is where those deals live now.
    expect(page).not.toContain('/products?city=')
  })

  it('states the empty case in words rather than an empty grid', () => {
    const page = code(PAGE)
    expect(page).toContain('data-testid="city-empty"')
    expect(page).toContain('עדיין אין דילים ב{name}')
  })
})

describe('/city/[slug] is registered', () => {
  it('in the sitemap through the same slug list and href helper', () => {
    const sitemap = read('src/app/sitemap.ts')
    expect(sitemap).toContain("import { allCityPageSlugs, cityPageHref } from '@/lib/city-page'")
    expect(sitemap).toContain('...allCityPageSlugs().map((slug) => ({')
    expect(sitemap).toContain('url: `${base}${cityPageHref(slug)}`')
  })

  it('in the metadata registry, the SEO audit, the render-mode suite and its own e2e spec', () => {
    expect(read('src/app/public-page-metadata.test.ts')).toContain("'(store)/city/[slug]/page.tsx'")
    expect(read('scripts/seo/audit.mjs')).toContain("'/city/'")
    expect(read('e2e/render-mode.spec.ts')).toContain("'/city/tel-aviv'")
    expect(read('e2e/city-page.spec.ts')).toContain('/city/tel-aviv')
  })

  it('is not disallowed for crawlers', () => {
    expect(read('src/app/robots.ts')).not.toContain("'/city")
  })

  it('keeps every region-menu href resolvable: the menu still reads regions.ts', () => {
    expect(read('src/components/layout/RegionMenu.tsx')).toContain('regionHref(region)')
    for (const region of REGIONS) expect(region.slug).not.toContain('%')
    for (const city of CITIES) expect(city.slug).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('/city/[slug] is reachable', () => {
  it('from the product page city tag', () => {
    expect(read('src/components/storefront/ProductInfo.tsx')).toContain(
      'href={`/city/${knownCity.slug}`}',
    )
  })

  it('from the merchant directory city line, only for a city the table knows', () => {
    const merchants = read('src/app/(store)/merchants/page.tsx')
    expect(merchants).toContain('href={`/city/${known.slug}`}')
    expect(merchants).toContain('cityByName(city)')
  })
})
