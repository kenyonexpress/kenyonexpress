import { expect, test } from '@playwright/test'

test.describe('shopping cart (guest)', () => {
  test('add to cart from product page then see it in the cart', async ({ page }) => {
    await page.goto('/products')
    const link = page.locator('a[href^="/product/"]').first()
    await expect(link).toBeVisible({ timeout: 15000 })
    await link.click()
    await page.waitForURL(/\/product\//)

    const productName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim()

    // .first(): related-products cards carry their own add-to-cart buttons
    const addButton = page.getByRole('button', { name: /הוסף לסל|רכוש קופון/ }).first()
    await addButton.click()
    await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    if (productName) {
      await expect(page.getByText(productName, { exact: false }).first()).toBeVisible()
    }
    // Guest checkout CTA routes through Google sign-in
    await expect(page.getByRole('button', { name: /המשך לתשלום/ })).toBeVisible()
  })
})
