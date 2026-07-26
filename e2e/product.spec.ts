import { expect, test } from '@playwright/test'
import { firstProductHref, openFirstProduct } from './helpers'

test.describe('product page', () => {
  test('shows name, shekel price, breadcrumb and purchase button', async ({ page }) => {
    await openFirstProduct(page)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/₪/).first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'נתיב ניווט' })).toBeVisible()
    // .first(): related-products cards carry their own add-to-cart buttons
    await expect(
      page.getByRole('button', { name: /הוסף לסל|קנה עכשיו|אזל מהמלאי|לא זמין לרכישה/ }).first(),
    ).toBeVisible()
  })

  test('offers WhatsApp share', async ({ page }) => {
    await openFirstProduct(page)
    await expect(page.getByRole('button', { name: 'שתפו בוואטסאפ' })).toBeVisible()
  })

  test('renders right-to-left with a Hebrew document title', async ({ page }) => {
    await openFirstProduct(page)

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    const heading = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? ''
    expect(heading.length).toBeGreaterThan(0)
    await expect(page).toHaveTitle(
      new RegExp(heading.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  })

  test('the breadcrumb links back to a real category archive', async ({ page }) => {
    await openFirstProduct(page)

    const crumb = page
      .getByRole('navigation', { name: 'נתיב ניווט' })
      .locator('a[href^="/category/"]')
      .first()
    test.skip((await crumb.count()) === 0, 'product has no category crumb')

    await crumb.click()
    await page.waitForURL(/\/category\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('an unknown product slug is a 404, not a blank page', async ({ page }) => {
    const response = await page.goto('/product/no-such-product-slug-12345')
    expect(response?.status()).toBe(404)
  })

  test('a product page is reachable directly by URL, not only by clicking through', async ({
    page,
  }) => {
    const href = await firstProductHref(page)
    const response = await page.goto(href)

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
