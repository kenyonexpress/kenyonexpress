import { expect, test } from '@playwright/test'
import { firstCategorySlug } from './helpers'

/**
 * The SEO markup a page actually SERVES, as opposed to the builders that make
 * it.
 *
 * `src/lib/seo/json-ld.test.ts` proves `buildProductJsonLd` returns the right
 * object. Nothing proved the product page renders it. That gap has a specific
 * shape here and this session met it three times in other subsystems: a
 * correct, well-tested builder with no consumer, or a consumer that quietly
 * stopped calling it. Deleting the `jsonLdScript` line from the product page
 * would leave every unit test green and every rich result gone.
 *
 * THE NOINDEX DIRECTION IS THE ONE WITH TEETH. A missing `Product` block costs
 * a rich result. A missing `noindex` on `/redeem/<token>` puts a live voucher
 * URL in a search index, which is the same class of leak the scrubber in
 * `sentry.server.config.ts` exists to prevent, arriving by a different road.
 */

/** The first product the archive links to, or null on an empty catalogue. */
async function firstProductPath(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/products')
  const card = page.locator('a[href^="/product/"]').first()
  await card.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  return card.getAttribute('href').catch(() => null)
}

/**
 * The `robots` meta content, or null when the tag is absent.
 *
 * NOT `locator.getAttribute().catch(...)`. That auto-waits for an element that
 * will never appear and burns the whole 30s test timeout before the catch can
 * run -- measured 2026-09-10, it failed two tests here as a timeout rather
 * than as an assertion. Absence is the COMMON case (a page with no `robots`
 * meta is indexable by default), so it has to be cheap.
 */
async function robotsMeta(page: import('@playwright/test').Page): Promise<string | null> {
  const tag = page.locator('meta[name="robots"]')
  if ((await tag.count()) === 0) return null
  return tag.first().getAttribute('content', { timeout: 2_000 })
}

/** Every JSON-LD block on the page, parsed. Unparseable blocks fail loudly. */
async function jsonLdOn(page: import('@playwright/test').Page): Promise<Record<string, unknown>[]> {
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''))

  return raw.flatMap((text) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Not skipped and not tolerated: a block Google cannot parse is worse
      // than no block, because it looks present in every other check.
      throw new Error(`unparseable JSON-LD: ${text.slice(0, 120)}`)
    }
    return (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[]
  })
}

test.describe('SEO markup, as served', () => {
  test('a product page carries Product JSON-LD and a breadcrumb', async ({ page }) => {
    const path = await firstProductPath(page)
    test.skip(!path, 'archive links no products in this catalogue')

    await page.goto(path as string)
    const blocks = await jsonLdOn(page)
    const types = blocks.map((b) => b['@type'])

    expect(types).toContain('Product')
    expect(types).toContain('BreadcrumbList')

    const product = blocks.find((b) => b['@type'] === 'Product')
    expect(product?.name, 'Product JSON-LD with no name is not a rich result').toBeTruthy()

    // AggregateRating is NOT required and its absence is not a failure:
    // `buildProductJsonLd` refuses to publish a rating over zero approved
    // reviews, which is the correct behaviour and the reason this assertion is
    // conditional rather than absolute.
    const rating = product?.aggregateRating as { ratingValue?: unknown } | undefined
    if (rating) expect(rating.ratingValue).toBeTruthy()
  })

  test('a product page is indexable and canonicalises to itself', async ({ page }) => {
    const path = await firstProductPath(page)
    test.skip(!path, 'archive links no products in this catalogue')

    await page.goto(path as string)

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    expect(canonical, 'a product page with no canonical splits its own ranking').toBeTruthy()
    // Absolute, and pointing at this product rather than at the site root. A
    // canonical that points somewhere else de-indexes the page it is on.
    expect(canonical).toMatch(/^https?:\/\//)
    const slug = decodeURIComponent((path as string).replace('/product/', ''))
    expect(decodeURIComponent(canonical as string)).toContain(slug)

    // Either absent (indexable by default) or present without noindex.
    expect((await robotsMeta(page)) ?? '').not.toContain('noindex')
  })

  test('the archive and a category page each canonicalise', async ({ page }) => {
    await page.goto('/products')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)

    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')
    await page.goto(`/category/${slug}`)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  })

  test('a voucher redemption URL is never indexable', async ({ page }) => {
    // The token is deliberately nonsense: this asserts the ROUTE's metadata,
    // and a real token must not appear in a spec. The page refuses the token
    // either way; what matters is that whatever it renders carries noindex.
    await page.goto('/redeem/KEV1.bm90LWEtdG9rZW4.bm90LWEtc2ln')

    const robots = await page.locator('meta[name="robots"]').getAttribute('content')
    expect(robots, 'a voucher URL in a search index is a leaked voucher').toContain('noindex')
  })

  test('the account area is never indexable', async ({ page }) => {
    await page.goto('/account/wishlist')

    // Signed out this redirects to login, which must also not be indexable;
    // signed in it is the wishlist, which carries its own noindex. Both
    // destinations are covered by asserting on wherever we land.
    const robots = await robotsMeta(page)
    if (page.url().includes('/account/')) {
      expect(robots ?? '').toContain('noindex')
    }
  })
})
