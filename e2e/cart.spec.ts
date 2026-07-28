import { type Page, expect, test } from '@playwright/test'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/** Reads the item count the header badge advertises via its aria-label. */
async function navCartCount(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /עגלת קניות, \d+ פריטים/ })
    .first()
    .getAttribute('aria-label')
  const match = /עגלת קניות, (\d+) פריטים/.exec(label ?? '')
  return match ? Number(match[1]) : 0
}

test.describe('shopping cart (guest)', () => {
  test('add to cart from product page then see it in the cart', async ({ page }) => {
    await openPurchasableProduct(page)
    const productName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim()
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    if (productName) {
      await expect(page.getByText(productName, { exact: false }).first()).toBeVisible()
    }
    // Guest checkout CTA routes through Google sign-in
    await expect(page.getByRole('button', { name: /המשך לתשלום/ })).toBeVisible()
  })

  test('shows an order summary with an on-site total in shekels', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
    await expect(summary).toBeVisible()
    await expect(summary.getByText('לתשלום באתר')).toBeVisible()
    await expect(summary.getByText(/₪/).first()).toBeVisible()
  })

  test('raising the quantity updates the header badge', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)

    await page.getByRole('button', { name: 'הוסף כמות' }).first().click()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(2)
  })

  test('lowering the quantity puts the badge back', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await page.getByRole('button', { name: 'הוסף כמות' }).first().click()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(2)

    await page.getByRole('button', { name: 'הפחת כמות' }).first().click()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)
  })

  test('a guest cart survives a page reload', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(1)
  })

  test('emptying the cart shows the empty state again', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await page.goto('/cart')
    await page.getByRole('button', { name: 'רוקן עגלה' }).click()

    await expect(page.getByRole('button', { name: 'רוקן עגלה' })).toBeHidden({ timeout: 10_000 })
    await expect.poll(() => navCartCount(page), { timeout: 10_000 }).toBe(0)
  })

  test('adding to the cart opens the drawer, and the header badge reopens it', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    // Adding auto-opens the drawer; that is the confirmation the shopper sees.
    const drawer = page.getByRole('dialog', { name: 'עגלת קניות' })
    await expect(drawer).toBeVisible()

    await page.getByRole('button', { name: 'סגור', exact: true }).click()
    await expect(drawer).toBeHidden()

    await page
      .getByRole('button', { name: /עגלת קניות, \d+ פריטים/ })
      .first()
      .click()
    await expect(drawer).toBeVisible()
  })

  test('an empty cart offers no checkout button', async ({ page }) => {
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    await expect(page.getByRole('button', { name: /המשך לתשלום/ })).toBeHidden()
  })
})
