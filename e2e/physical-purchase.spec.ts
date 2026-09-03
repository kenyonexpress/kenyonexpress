import { expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_PHYSICAL_SLUG,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { BUY_BUTTON, expectHebrewRtl } from './helpers'

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
    const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await ctx.newPage()

    // Fixture check BEFORE login, so an unseeded database self-skips rather
    // than failing on a login that has no user behind it.
    await page.goto(`/product/${E2E_PHYSICAL_SLUG}`)
    await expectHebrewRtl(page)
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    const buyable = await buy.isVisible().catch(() => false)
    test.skip(!buyable, 'e2e-test-physical is not purchasable; run pnpm seed:test')
    test.skip(await buy.isDisabled(), 'e2e-test-physical is out of stock')

    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
    await page.goto(`/product/${E2E_PHYSICAL_SLUG}`)

    await buy.click()
    await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()

    await page.goto('/checkout')
    await expect(page.getByRole('heading', { name: 'תשלום' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('מוצר פיזי לבדיקות אוטומטיות')).toBeVisible()
    await page.locator('input[name="accept_terms"]').check()
    await page.getByRole('button', { name: 'מעבר לתשלום מאובטח' }).click()

    await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
      timeout: 45_000,
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
