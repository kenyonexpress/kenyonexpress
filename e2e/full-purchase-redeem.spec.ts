import { expect, test } from '@playwright/test'
import {
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  clearBrowserSession,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { BUY_BUTTON, emptyCart, expectHebrewRtl, walkCheckoutToPayment } from './helpers'

/**
 * End-to-end money path against Cardcom mock + seeded fixtures:
 * guest cart → login at pay (Google button present; email used in CI) →
 * mock hosted page return → coupon issued with QR → supplier scan redeem.
 *
 * Requires:
 *   - scripts/seed-test-data.mjs (products + customer + supplier member)
 *   - CARDCOM_USE_MOCK=true on the app under test (Playwright webServer env)
 *
 * Skip with E2E_PAID_FLOW=0 when the shared DB cannot host fixtures.
 */

test.describe('full purchase to redeem @checkout @redeem @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('guest coupon cart → auth gate with Google → mock pay → voucher → supplier redeem', async ({
    browser,
  }) => {
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()

    // Start the account from an empty cart, then leave as a guest again so the
    // guest-cart merge below has exactly one line to merge.
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
    await emptyCart(page)
    await clearBrowserSession(page)

    await page.goto(`/product/${E2E_COUPON_SLUG}`)
    await expectHebrewRtl(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })

    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    const buyable = await buy.isVisible().catch(() => false)
    test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')
    test.skip(await buy.isDisabled(), 'e2e-test-coupon is out of stock')

    await buy.click()
    await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()

    // Since f6392ed6e (2026-07-29) a guest is NOT turned away at /checkout: the
    // form renders, and only the press of "pay" needs an identity, which sends
    // the guest to Google. This spec expected the old door-gate until the
    // 2026-09-21 go-live dry run measured the page landing on /checkout itself.
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('קונית כאן בעבר?')).toBeVisible()
    await expectHebrewRtl(page)

    // CI cannot complete real Google OAuth, and the pay button's gate IS
    // Google. Email/password on /login hits the same mergeGuestCart path the
    // Google callback uses after the OAuth hop, so sign in there and return.
    await page.goto('/login?next=%2Fcheckout')
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page.getByRole('button', { name: /כניסה עם Google/ })).toBeVisible()
    await page.getByLabel('אימייל').fill(E2E_CUSTOMER_EMAIL)
    await page.getByLabel('סיסמה').fill(E2E_CUSTOMER_PASSWORD)
    await page.getByRole('button', { name: 'כניסה', exact: true }).click()
    await page.waitForURL(/\/checkout/, { timeout: 20_000 })

    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('קופון בדיקות אוטומטיות')).toBeVisible()

    await walkCheckoutToPayment(page, E2E_CUSTOMER_EMAIL)

    // Mock Cardcom redirects straight back to /checkout/return; reconcile
    // verifies the in-memory deal and finalizes (issues vouchers).
    await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
      timeout: 45_000,
    })
    await expect(page.getByTestId('coupon-code').first()).toBeVisible()
    await expect(page.getByTestId('coupon-qr').first()).toBeVisible()
    await expectHebrewRtl(page)

    const codeText = (await page.getByTestId('coupon-code').first().textContent()) ?? ''
    const voucherCode = codeText.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    expect(voucherCode.length).toBe(10)

    // Coupon also appears in the personal area.
    await page.goto('/account/coupons')
    await expect(page.getByRole('heading', { name: /הקופונים שלי|קופונים/ })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(new RegExp(voucherCode.slice(0, 5)))).toBeVisible()

    await customer.close()

    // Supplier redeem (manual code entry; camera is optional and flaky in CI).
    const supplier = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const scanPage = await supplier.newPage()
    await signInWithEmail(scanPage, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, '/supplier/scan')
    await scanPage.goto('/supplier/scan')
    await expect(scanPage.getByRole('heading', { name: 'סריקת שובר' })).toBeVisible({
      timeout: 15_000,
    })
    await expectHebrewRtl(scanPage)

    await scanPage.getByLabel('הקלדת קוד ידנית').fill(voucherCode)
    await scanPage.getByRole('button', { name: 'בדוק שובר' }).click()
    await expect(scanPage.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ })).toBeVisible()
    await scanPage.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ }).click()

    await expect(scanPage.getByText('השובר מומש בהצלחה')).toBeVisible({ timeout: 20_000 })
    await expect(scanPage.getByText('לגבייה מהלקוח עכשיו')).toBeVisible()

    await supplier.close()
  })

  test('Google button is the primary CTA on the pay gate (no silent email-only)', async ({
    page,
  }) => {
    await clearBrowserSession(page)
    await page.goto(`/product/${E2E_COUPON_SLUG}`)
    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    if (!(await buy.isVisible().catch(() => false))) {
      test.skip(true, 'e2e-test-coupon missing; run pnpm seed:test')
    }
    await buy.click()
    await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()

    // The gate moved from the door to the pay button (f6392ed6e): a guest sees
    // the whole form, a returning-customer notice, and a hidden Google form
    // that "pay" submits with the resume path. No silent email-only path.
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout$/)
    await expect(page.getByText('קונית כאן בעבר?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'יש ללחוץ כאן כדי להתחבר' })).toBeVisible()
    await expect(page.locator('form[hidden] input[name="next"]')).toHaveAttribute(
      'value',
      '/checkout?resume=1',
    )
    // And the door itself still offers Google above email for whoever walks in.
    await page.goto('/login?next=%2Fcheckout')
    const google = page.getByRole('button', { name: /כניסה עם Google/ })
    await expect(google).toBeVisible()
    const googleBox = await google.boundingBox()
    const emailBox = await page.getByLabel('אימייל').boundingBox()
    expect(googleBox && emailBox && googleBox.y < emailBox.y).toBeTruthy()
  })
})
