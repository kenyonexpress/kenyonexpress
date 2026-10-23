import { expect, test } from '@playwright/test'
import {
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
} from './auth-session'
import {
  BUY_BUTTON,
  DISCOVERY_TIMEOUT,
  PAY_RETURN_TIMEOUT,
  addOpenProductToCart,
  emptyCart,
  newFixtureContext,
  newSignedInContext,
  submitCheckout,
} from './helpers'

/**
 * Checkout completion at the three design widths (380 / 768 / 1440) with mock provider.
 *
 * C14: Ensures checkout flow completes successfully at all three viewport widths
 * that the design was signed off at, using the mock payment provider.
 *
 * NOTE: True "guest" checkout (anonymous sessions) requires Supabase configuration
 * (enable anonymous sign-ins + manual linking) which is not available in test env.
 * The checkout action explicitly requires auth: `if (!user) return UNAUTHENTICATED`.
 * Tests use authenticated flow like full-purchase-redeem.spec.ts.
 *
 * Uses E2E coupon product (no shipping address needed).
 */

const WIDTHS = [380, 768, 1440] as const

for (const width of WIDTHS) {
  test.describe(`checkout at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test.describe.configure({ timeout: 150_000 })

    test.beforeEach(() => {
      test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
    })

    test('anonymous visitor with empty cart is sent to cart, not login', async ({ page }) => {
      await page.goto('/checkout')
      await expect(page).toHaveURL(/\/cart/, { timeout: 15000 })
    })

    test('anonymous visitor with populated cart reaches checkout form', async ({ page }) => {
      await page.goto(`/product/${E2E_COUPON_SLUG}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
      const buyable = await buy.isVisible().catch(() => false)
      test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')

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

    test('authenticated user completes checkout with mock payment provider', async ({
      browser,
    }) => {
      // Empty fixture customer cart first
      const prep = await newSignedInContext(browser, 'customer')
      await emptyCart(await prep.newPage())
      await prep.close()

      // Create customer context and add product
      const customer = await newFixtureContext(browser)
      const page = await customer.newPage()

      await page.goto(`/product/${E2E_COUPON_SLUG}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
      const buyable = await buy.isVisible().catch(() => false)
      test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')
      test.skip(await buy.isDisabled(), 'e2e-test-coupon is out of stock')

      await addOpenProductToCart(page)

      // Sign in before checkout (required by checkout action)
      await page.goto('/login?next=%2Fcheckout')
      await expect(page).toHaveURL(/\/login\?.*next=%2Fcheckout/, { timeout: 15_000 })
      await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(E2E_CUSTOMER_EMAIL)
      await page.getByLabel('סיסמה').fill(E2E_CUSTOMER_PASSWORD)
      await page.getByRole('button', { name: 'כניסה', exact: true }).click()
      await page.waitForURL(/\/checkout/, { timeout: 30_000 })

      // Verify checkout heading
      await expect(page.getByRole('heading', { level: 1, name: 'קופה' })).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      // Verify coupon is in cart
      await expect(page.getByText('קופון בדיקות אוטומטיות').first()).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      // Navigate through steps and submit
      await submitCheckout(page)

      // Mock provider redirects to /checkout/return with order_id
      await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: PAY_RETURN_TIMEOUT })

      // Verify success page
      await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
        timeout: PAY_RETURN_TIMEOUT,
      })

      // Verify coupon code is shown
      await expect(page.getByTestId('coupon-code').first()).toBeVisible()

      // Verify RTL maintained on success page
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

      await customer.close()
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
