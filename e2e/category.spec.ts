import { expect, test } from '@playwright/test'
import { firstCategorySlug } from './helpers'

test.describe('category archive', () => {
  test('renders the title, result count, breadcrumb and a product grid', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'נתיב ניווט' })).toBeVisible()

    // Either products, or the empty-state copy. Both are valid archive states;
    // a blank page with neither is the regression this guards against.
    const grid = page.locator('a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    await expect(grid.or(empty)).toBeVisible({ timeout: 15_000 })
  })

  test('sorting by price rewrites the URL and keeps the archive rendered', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}`)
    const sort = page.getByLabel('מיון מוצרים')
    await expect(sort).toBeVisible()

    // The select speaks WooCommerce orderby values ("price"); the URL speaks
    // our own sort keys ("price_asc"). The mapping between them is the thing
    // most likely to drift, so pin both ends.
    await sort.selectOption('price')
    await page.waitForURL(/[?&]sort=price_asc\b/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('keeps the sort selection when the page reloads', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}?sort=price_desc`)
    await expect(page.getByLabel('מיון מוצרים')).toHaveValue('price-desc')
  })

  test('an unrecognised sort key falls back to the default order', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    await page.goto(`/category/${slug}?sort=not-a-sort`)
    await expect(page.getByLabel('מיון מוצרים')).toHaveValue('menu_order')
  })

  test('an unknown category slug is a 404, not a blank page', async ({ page }) => {
    const response = await page.goto('/category/no-such-category-slug-12345')
    expect(response?.status()).toBe(404)
  })

  test('an out-of-range page number clamps instead of erroring', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const response = await page.goto(`/category/${slug}?page=9999`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('a price filter narrows the archive without breaking it', async ({ page }) => {
    const slug = await firstCategorySlug(page)
    test.skip(!slug, 'catalog exposes no category links')

    const response = await page.goto(`/category/${slug}?min=0&max=1`)
    expect(response?.status()).toBe(200)

    const grid = page.locator('a[href^="/product/"]').first()
    const empty = page.getByText('לא נמצאו מוצרים התואמים את הבחירה שלך.')
    await expect(grid.or(empty)).toBeVisible({ timeout: 15_000 })
  })

  /**
   * Two regressions in one assertion, both measured on the build before this
   * test existed.
   *
   * WEIGHT: the card served a raw <img>, so /products handed a phone 604KB of
   * 600x600 originals to paint 186px boxes - the optimizer was not bypassed by
   * configuration, it was never reached.
   *
   * VISIBILITY, which is the one that matters more: 45 of the catalog's image
   * rows are picsum.photos URLs, and picsum is NOT in the CSP img-src (only
   * self, data, blob, supabase and unsplash are). Every one of them was blocked
   * outright and rendered as a broken thumbnail. Routing through /_next/image
   * makes the request same-origin, which is why they draw at all now.
   *
   * Lives in E2E and not Vitest for the same reason as the deal-card guard:
   * jsdom has no layout engine, does not resolve srcset, and does not enforce
   * a CSP, so all three halves of this are invisible to it.
   */
  test('catalog thumbnails go through the image optimizer and decode', async ({ page }) => {
    await page.goto('/products')

    const thumbs = page.locator('.category-card__thumb img')
    const count = await thumbs.count()
    test.skip(count === 0, 'catalog exposes no product thumbnails')

    // The thumbs are lazy, so a page that has merely loaded has decoded none of
    // them. Bring the first one into view and wait for the bytes, or the decode
    // half of this test measures the scroll position instead of the image.
    await thumbs.first().scrollIntoViewIfNeeded()
    await expect
      .poll(() => thumbs.first().evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        message: 'first catalog thumbnail never decoded',
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    const rendered = await thumbs.evaluateAll((els) =>
      els.map((el) => {
        const img = el as HTMLImageElement
        return {
          src: img.currentSrc || img.src,
          naturalWidth: img.naturalWidth,
          width: Math.round(img.getBoundingClientRect().width),
        }
      }),
    )

    for (const img of rendered) {
      expect(img.src, 'thumbnail bypassed /_next/image').toContain('/_next/image')
    }

    // At least one has to have actually decoded. Asserting every one would make
    // the test hostage to a single dead remote URL in the catalog data, which
    // is a data defect and not this component's.
    expect(
      rendered.filter((i) => i.naturalWidth > 0 && i.width > 50).length,
      'no catalog thumbnail decoded into a real box',
    ).toBeGreaterThan(0)

    // The reservation the skeleton already promises. Every thumb box is the
    // same height whether its image arrived, failed, or is a 600x408 landscape
    // - otherwise the card shrinks under the bytes and everything below it
    // jumps, which measured as CLS 0.36 on this page.
    const boxes = await page
      .locator('.category-card__thumb')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
    for (const h of boxes) {
      expect(h, 'thumb box height depends on the image that loaded').toBe(186)
    }
  })
})
