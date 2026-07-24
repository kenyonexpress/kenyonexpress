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
})
