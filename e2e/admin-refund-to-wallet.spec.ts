import { expect, test } from '@playwright/test'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { BUY_BUTTON, expectHebrewRtl } from './helpers'

/**
 * The OTHER refund instrument, end to end.
 *
 * `admin-refund.spec.ts` proves the card path and ends on the assertion that
 * matters: "the voucher dies with it". Nothing proved the same thing for the
 * wallet, and until 2026-09-07 it was not true. `refundOrderToWallet` never
 * looked at a voucher, and the button is deliberately NOT gated on
 * `refundBlockers`, so it was reachable on an order whose vouchers were still
 * `issued`: the customer got the coupon price back into their wallet AND kept a
 * coupon the business would still honour for the balance alone.
 *
 * A unit test now covers the conditional update. This covers the thing a unit
 * test cannot: that the button a human actually presses reaches that code, and
 * that the screen afterwards tells the truth about the voucher.
 *
 * Same stack and same fixtures as `admin-refund.spec.ts`, and the same
 * self-skip on an unseeded database, so this never fails against production.
 */

test.describe('admin credit to wallet @money @admin', () => {
  test.describe.configure({ timeout: 150_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('a wallet credit kills the live voucher instead of leaving it scannable', async ({
    browser,
  }) => {
    // ---- leg 1: the customer pays ---------------------------------------
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()

    await page.goto(`/product/${E2E_COUPON_SLUG}`)
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    const buyable = await buy.isVisible().catch(() => false)
    test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')

    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
    await page.goto(`/product/${E2E_COUPON_SLUG}`)

    await buy.click()
    await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { name: 'תשלום' })).toBeVisible({ timeout: 15_000 })
    await page.locator('input[name="accept_terms"]').check()
    await page.getByRole('button', { name: 'מעבר לתשלום מאובטח' }).click()
    await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
      timeout: 45_000,
    })

    const orderId = new URL(page.url()).searchParams.get('order_id')
    expect(orderId, 'order_id on the return URL').toBeTruthy()
    await customer.close()

    // ---- leg 2: the admin credits the wallet ------------------------------
    const adminCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const adminPage = await adminCtx.newPage()
    await signInWithEmail(
      adminPage,
      E2E_ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD,
      `/admin/orders/${orderId}`,
    )
    await adminPage.goto(`/admin/orders/${orderId}`)
    await expectHebrewRtl(adminPage)

    // The panel is present on a plain paid order, with no blocker in sight.
    // That availability is the whole reason the hole was reachable.
    await expect(adminPage.getByRole('heading', { name: 'זיכוי לארנק' })).toBeVisible({
      timeout: 20_000,
    })

    await adminPage.locator('#wallet-reason').fill('בדיקת E2E: זיכוי רצון טוב')
    await adminPage.getByRole('button', { name: 'יזום זיכוי לארנק' }).click()
    await adminPage.getByRole('button', { name: 'אישור סופי, זיכוי לארנק' }).click()

    await expect(adminPage.getByText(/זוכה|הזיכוי/).first()).toBeVisible({ timeout: 30_000 })

    // THE ASSERTION THIS FILE EXISTS FOR. Same one the card spec ends on: a
    // voucher must not survive a refund as something a counter would still burn.
    await adminPage.reload()
    await expect(adminPage.getByText('הוחזר').first()).toBeVisible({ timeout: 20_000 })
    await adminCtx.close()
  })
})
