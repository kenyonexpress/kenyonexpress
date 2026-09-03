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
 * Admin cancel-and-refund, end to end (marathon step 10, journey d):
 * customer buys a coupon through the Cardcom mock → an admin opens the
 * order and initiates the refund → the money answer is shown and the
 * voucher flips to refunded.
 *
 * Requires the same stack as full-purchase-redeem.spec.ts, PLUS the admin
 * fixture (`pnpm seed:test` now creates e2e-admin@ with role 'admin' --
 * deliberately not super_admin, so this proves the WEAKEST role that may
 * refund actually can).
 */

test.describe('admin cancel and refund @money @admin', () => {
  test.describe.configure({ timeout: 150_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('a paid coupon order is refunded from the admin, and the voucher dies with it', async ({
    browser,
  }) => {
    // ---- leg 1: the customer pays ---------------------------------------
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()

    // Fixture check BEFORE any login: on an unseeded database (production is
    // deliberately never seeded) the whole journey self-skips instead of
    // failing on a login that has no user behind it.
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

    // ---- leg 2: the admin refunds ----------------------------------------
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
    await expect(adminPage.getByRole('heading', { name: 'החזר לכרטיס' })).toBeVisible({
      timeout: 20_000,
    })

    await adminPage.locator('#refund-reason').fill('בדיקת E2E: ביטול והחזר')
    // Defect cancellation: the fee is waived, so the refund is the full charge
    // and the assertion below does not depend on the 5%/100 fee math.
    await adminPage.getByText('ביטול עקב פגם או אי-התאמה').click()
    await adminPage.getByRole('button', { name: 'יזום החזר' }).click()
    await adminPage.getByRole('button', { name: 'אישור סופי, החזר לכרטיס' }).click()

    // Either wording is a success: pre-settlement void or an executed refund.
    await expect(adminPage.getByText(/העסקה בוטלה לפני שידור לסליקה|ההחזר יצא לביצוע/)).toBeVisible(
      { timeout: 30_000 },
    )

    // The voucher must not survive the refund as redeemable.
    await adminPage.reload()
    await expect(adminPage.getByText('הוחזר').first()).toBeVisible({ timeout: 20_000 })
    await adminCtx.close()
  })
})
