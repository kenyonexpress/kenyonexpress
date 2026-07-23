import { expect, test } from '@playwright/test'

// Product slugs are Hebrew and DB-driven, so discover one from the archive
// instead of hard-coding demo slugs.
async function openFirstProduct(page: import('@playwright/test').Page) {
  await page.goto('/products')
  const link = page.locator('a[href^="/product/"]').first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
  await page.waitForURL(/\/product\//)
}

test.describe('product page', () => {
  test('shows name, shekel price, breadcrumb and purchase button', async ({ page }) => {
    await openFirstProduct(page)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/₪/).first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'נתיב ניווט' })).toBeVisible()
    // .first(): related-products cards carry their own add-to-cart buttons
    await expect(
      page.getByRole('button', { name: /הוסף לסל|רכוש קופון|אזל מהמלאי/ }).first(),
    ).toBeVisible()
  })

  test('offers WhatsApp share', async ({ page }) => {
    await openFirstProduct(page)
    await expect(page.getByRole('button', { name: 'שתפו בוואטסאפ' })).toBeVisible()
  })
})
