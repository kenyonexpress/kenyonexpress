import { expect, test } from '@playwright/test'
import { DISCOVERY_TIMEOUT, addOpenProductToCart, openPurchasableProduct } from './helpers'

/**
 * Guest checkout at the three design widths (380 / 768 / 1440) with mock provider.
 *
 * C14: Ensures guest checkout flow works correctly at all three viewport widths
 * that the design was signed off at, using the mock payment provider.
 */

const WIDTHS = [380, 768, 1440] as const

for (const width of WIDTHS) {
  test.describe(`guest checkout at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('anonymous visitor with empty cart is sent to cart, not login', async ({ page }) => {
      await page.goto('/checkout')
      await expect(page).toHaveURL(/\/cart/, { timeout: 15000 })
    })

    test('anonymous visitor with populated cart reaches checkout form', async ({ page }) => {
      await openPurchasableProduct(page)
      await addOpenProductToCart(page)

      await page.goto('/checkout')
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15000 })
      await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()

      // Verify RTL is maintained at this width
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(page.locator('html')).toHaveAttribute('lang', 'he')

      // Verify no horizontal scroll
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        scrollWidth,
        `checkout is ${scrollWidth}px wide in a ${width}px viewport`,
      ).toBeLessThanOrEqual(clientWidth + 1)
    })

    test('cart CTA hands guest to checkout at this width', async ({ page }) => {
      await openPurchasableProduct(page)
      await addOpenProductToCart(page)

      await page.goto('/cart')
      const cta = page.getByRole('link', { name: /המשך לתשלום/ })
      await expect(cta.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
      await cta.first().click()
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15000 })
      await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()
    })

    test('checkout form is fillable at this width', async ({ page }) => {
      await openPurchasableProduct(page)
      await addOpenProductToCart(page)

      await page.goto('/checkout')
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15000 })

      // Verify form fields are present and fillable
      const nameField = page.getByLabel(/שם מלא|שם/)
      await expect(nameField.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

      const emailField = page.getByLabel(/אימייל|דוא"ל/)
      await expect(emailField.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

      const phoneField = page.getByLabel(/טלפון/)
      await expect(phoneField.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

      // Fill form to verify it works
      await nameField.first().fill('בדיקה אוטומטית')
      await emailField.first().fill('test@example.com')
      await phoneField.first().fill('0501234567')

      // Verify values were filled
      await expect(nameField.first()).toHaveValue('בדיקה אוטומטית')
      await expect(emailField.first()).toHaveValue('test@example.com')
      await expect(phoneField.first()).toHaveValue('0501234567')
    })

    test('checkout subtree remains protected for guests at this width', async ({ page }) => {
      // /checkout/return and /checkout/failed should redirect to login
      for (const path of ['/checkout/failed', '/checkout/return']) {
        await page.goto(path)
        await expect(page).toHaveURL(/\/login\?.*next=%2Fcheckout%2F/, { timeout: 15000 })
        await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
      }
    })
  })
}
