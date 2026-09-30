import { expect, test } from '@playwright/test'
import { firstCategorySlug } from './helpers'

/**
 * STEP 06, category page: the SEO and RTL contract as a gate.
 *
 * Four things a crawler reads off `/category/[slug]` and a shopper never
 * sees, each asserted on the served document rather than on the source:
 *
 * 1. One canonical, pointing at the bare archive. Sort, page and every facet
 *    are query strings on the same slug, and without this each of them
 *    competes as its own page.
 * 2. A `BreadcrumbList` that names the same trail the visible <nav> prints.
 * 3. An `ItemList` whose entries are the cards on the page, in page order,
 *    numbered from the page's offset in the archive.
 * 4. `direction: rtl` on the archive's landmarks, and no `dir="ltr"` on any
 *    node inside the archive. `home-rtl.spec.ts` does the same for `/`.
 *
 * Plus the empty state: a facet nobody matches must show the sentence AND a
 * way out that drops the facet, not a blank grid.
 */

const ARCHIVE_ANCHORS: ReadonlyArray<readonly [label: string, selector: string]> = [
  ['archive wrapper', '.category-page'],
  ['breadcrumb nav', 'nav[aria-label="נתיב ניווט"]'],
  ['archive heading', 'h1.category-page__title'],
  ['control bar', '.category-control-bar'],
  ['archive body', '.category-page__body'],
]

async function jsonLdNodes(page: import('@playwright/test').Page) {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents()
  return scripts.flatMap((text) => {
    const parsed = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[]
    return Array.isArray(parsed) ? parsed : [parsed]
  })
}

test.describe('category page SEO', () => {
  test('carries one canonical pointing at the bare archive, even when filtered', async ({
    page,
  }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const path = `/category/${slug}`
    const filtered = `${path}?sort=price_asc&page=2&min=10`

    // The served document is what a crawler reads first: exactly one canonical.
    const html = await (await page.request.get(filtered)).text()
    const served = html.match(/<link rel="canonical"[^>]*>/g) ?? []
    expect(served, 'one canonical in the served HTML').toHaveLength(1)

    // The hydrated document, after the streamed metadata lands. React hoists
    // the runtime canonical next to the prerendered one and dedupes by href,
    // so on a server whose NEXT_PUBLIC_APP_URL differs from the one the build
    // baked in there are two links with two hosts. That is a local artefact
    // (site-url-baked-at-build-time), not a page defect, so the assertion is
    // on what both agree on: the bare archive path, no query string, one
    // distinct target per host.
    await page.goto(filtered)
    const hrefs = await page.$$eval('link[rel="canonical"]', (links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    )
    expect(hrefs.length).toBeGreaterThanOrEqual(1)
    for (const href of hrefs) {
      const url = new URL(href)
      expect(url.pathname, href).toBe(path)
      expect(url.search, href).toBe('')
    }
    expect(new Set(hrefs.map((h) => new URL(h).host)).size, 'one canonical per host').toBe(
      hrefs.length,
    )
  })

  test('the BreadcrumbList names the same trail the visible breadcrumb prints', async ({
    page,
  }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const nodes = await jsonLdNodes(page)
    const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList')
    expect(crumbs, 'BreadcrumbList is present').toBeTruthy()

    const items = (crumbs as { itemListElement: { name: string; position: number }[] })
      .itemListElement
    const visible = await page
      .getByRole('navigation', { name: 'נתיב ניווט' })
      .locator('a, span:not(:has(*))')
      .allTextContents()
    const visibleNames = visible.map((t) => t.trim()).filter((t) => t !== '')

    expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1))
    expect(items.map((i) => i.name)).toEqual(visibleNames)
    expect(items.at(-1)?.name).toBe(
      (await page.getByRole('heading', { level: 1 }).textContent())?.trim(),
    )
  })

  test('the ItemList is the cards on the page, in page order, numbered from one', async ({
    page,
  }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)
    const grid = page.locator('a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    await expect(grid.or(empty)).toBeVisible({ timeout: 15_000 })

    const nodes = await jsonLdNodes(page)
    const list = nodes.find((n) => n['@type'] === 'ItemList') as
      | { itemListElement: { position: number; url: string }[]; numberOfItems: number }
      | undefined

    if (await empty.isVisible()) {
      expect(list, 'an empty archive publishes no ItemList').toBeUndefined()
      return
    }

    expect(list, 'ItemList is present').toBeTruthy()
    const cardHrefs = await page
      .locator('.category-products__item a[href^="/product/"]')
      .evaluateAll((anchors) => [...new Set(anchors.map((a) => (a as HTMLAnchorElement).pathname))])

    const listPaths = (list as NonNullable<typeof list>).itemListElement.map(
      (i) => new URL(i.url).pathname,
    )
    expect(listPaths).toEqual(cardHrefs)
    expect((list as NonNullable<typeof list>).numberOfItems).toBe(cardHrefs.length)
    expect((list as NonNullable<typeof list>).itemListElement[0]?.position).toBe(1)
  })

  test('the archive resolves to direction rtl and carries no dir=ltr', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    for (const [label, selector] of ARCHIVE_ANCHORS) {
      const direction = await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).direction)
      expect(direction, `${label} (${selector})`).toBe('rtl')
    }

    const ltrNodes = await page.locator('.category-page [dir="ltr"]').count()
    expect(ltrNodes, 'no node inside the archive declares dir="ltr"').toBe(0)
  })

  test('a facet nobody matches shows the empty state with a way out', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}?brand=no-such-brand-e2e&min=1&max=2`)

    await expect(page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')).toBeVisible({
      timeout: 15_000,
    })
    const clear = page.getByRole('link', { name: 'נקו את כל הסינונים' })
    await expect(clear).toBeVisible()
    expect(new URL(await clear.evaluate((a) => (a as HTMLAnchorElement).href)).search).toBe('')
    expect(new URL(await clear.evaluate((a) => (a as HTMLAnchorElement).href)).pathname).toBe(
      `/category/${slug}`,
    )
    // No dead grid behind it, and no ItemList claiming cards that are not there.
    await expect(page.locator('.category-products__item')).toHaveCount(0)
    const nodes = await jsonLdNodes(page)
    expect(nodes.find((n) => n['@type'] === 'ItemList')).toBeUndefined()
  })
})
