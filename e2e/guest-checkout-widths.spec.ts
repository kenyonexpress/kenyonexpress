import { expect, test } from '@playwright/test'
import { E2E_COUPON_SLUG, paidFlowEnabled } from './auth-session'
import {
  BUY_BUTTON,
  DISCOVERY_TIMEOUT,
  PAY_RETURN_TIMEOUT,
  addOpenProductToCart,
  submitCheckout,
} from './helpers'

/**
 * Guest checkout at the three design widths (380 / 768 / 1440) with mock provider.
 *
 * C14: Ensures guest checkout flow completes successfully at all three viewport widths
 * using anonymous Supabase sessions and the mock payment provider.
 *
 * REQUIRES Supabase project configuration (NOT code, external dashboard settings):
 * - Enable Anonymous sign-ins in project settings
 * - Enable Manual linking in project settings
 *
 * Without these settings, ensureGuestIdentity falls back to requiring authentication
 * and tests will fail with UNAUTHENTICATED error.
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

    test('guest completes checkout with mock payment provider (anonymous session)', async ({
      page,
    }) => {
      // Clear any existing session to ensure true guest flow
      await page.context().clearCookies()

      await page.goto(`/product/${E2E_COUPON_SLUG}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
      const buyable = await buy.isVisible().catch(() => false)
      test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')
      test.skip(await buy.isDisabled(), 'e2e-test-coupon is out of stock')

      await addOpenProductToCart(page)

      // Go directly to checkout as guest (no sign-in)
      await page.goto('/checkout')
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15000 })

      // Verify checkout heading
      await expect(page.getByRole('heading', { level: 1, name: 'קופה' })).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      // Verify coupon is in cart
      await expect(page.getByText('קופון בדיקות אוטומטיות').first()).toBeVisible({
        timeout: DISCOVERY_TIMEOUT,
      })

      // Navigate through steps and submit
      // Guest checkout should create anonymous session automatically on pay press
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
