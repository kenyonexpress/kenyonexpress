import { expect } from '@playwright/test'
import { E2E_CUSTOMER_EMAIL, E2E_PHYSICAL_SLUG, paidFlowEnabled } from './auth-session'
import {
  BUY_BUTTON,
  PAY_RETURN_TIMEOUT,
  addOpenProductToCart,
  emptyCart,
  expectHebrewRtl,
  newSignedInContext,
  submitCheckout,
  sharedCustomerTest as test,
} from './helpers'

/**
 * A signed-in customer buys a PHYSICAL product (marathon step 10, journey b).
 * The coupon journey is covered by full-purchase-redeem.spec.ts; what this
 * one pins is everything the physical path does differently: no voucher, no
 * QR, an order that lands in the account as a shipment-in-waiting.
 */

test.describe('logged-in physical purchase @checkout @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('signed-in customer → physical product → mock pay → order, no voucher', async ({
    browser,
  }) => {
    const ctx = await newSignedInContext(browser, 'customer')
    const page = await ctx.newPage()

    // Fixture check BEFORE login, so an unseeded database self-skips rather
    // than failing on a login that has no user behind it.
    await page.goto(`/product/${E2E_PHYSICAL_SLUG}`)
    await expectHebrewRtl(page)
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    const buyable = await buy.isVisible().catch(() => false)
    test.skip(!buyable, 'e2e-test-physical is not purchasable; run pnpm seed:test')
    test.skip(await buy.isDisabled(), 'e2e-test-physical is out of stock')

    await emptyCart(page)
    await page.goto(`/product/${E2E_PHYSICAL_SLUG}`)

    // Settled by the header badge AND the button leaving its pending state,
    // not by the "נוסף לסל" label: that label is a 2-second timer that the
    // route refresh can wipe, and on a slow backend it has not even appeared
    // when a 5 s expectation expires (run 5, 2026-10-20: the buy button was
    // still disabled at the 5 s mark and the add landed later). See
    // addOpenProductToCart for the measurement.
    await addOpenProductToCart(page)

    await page.goto('/checkout')
    await expect(page.getByText('מוצר פיזי לבדיקות אוטומטיות').first()).toBeVisible({
      timeout: 15_000,
    })
    // The fixture is long past the five-physical-orders threshold, so the
    // address step asks for the WhatsApp code; its saved address carries
    // 052-123-4567. See submitCheckout and e2e/otp-seed.ts.
    await submitCheckout(page, {
      phoneVerification: { email: E2E_CUSTOMER_EMAIL, phoneE164: '+972521234567' },
    })

    await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: PAY_RETURN_TIMEOUT })
    await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
      timeout: PAY_RETURN_TIMEOUT,
    })
    await expectHebrewRtl(page)

    // The physical path issues NO voucher: a coupon code here would mean the
    // type snapshot broke and a shipment was sold as a scannable.
    await expect(page.getByTestId('coupon-code')).toHaveCount(0)
    await expect(page.getByTestId('coupon-qr')).toHaveCount(0)

    // And the order is in the account.
    await page.goto('/account/orders')
    await expect(page.getByText('מוצר פיזי לבדיקות אוטומטיות').first()).toBeVisible({
      timeout: 15_000,
    })
    await ctx.close()
  })
})
