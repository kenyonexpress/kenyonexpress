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
import { addProductBySlug, fillCheckoutAndPay } from './checkout-flow'
import { expectHebrewRtl } from './helpers'

/**
 * Guest cart → login at pay (Google CTA present; email used in CI) →
 * mock hosted page return → coupon issued with QR → supplier scan redeem →
 * customer wallet shows the purchase credit.
 *
 * Requires:
 *   - scripts/seed-test-data.mjs
 *   - CARDCOM_USE_MOCK=true on the app under test
 *
 * Skip with E2E_PAID_FLOW=0 when the shared DB cannot host fixtures.
 */

test.describe('full purchase to redeem @checkout @redeem @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('guest coupon cart → auth gate with Google → mock pay → voucher → supplier redeem → wallet', async ({
    browser,
  }) => {
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()

    await addProductBySlug(page, E2E_COUPON_SLUG)

    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'יש ללחוץ כאן כדי להתחבר' })).toBeVisible()
    await expectHebrewRtl(page)

    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/checkout')
    await page.goto('/checkout')
    await fillCheckoutAndPay(page)

    await expect(page.getByTestId('coupon-code').first()).toBeVisible()
    await expect(page.getByTestId('coupon-qr').first()).toBeVisible()
    await expectHebrewRtl(page)

    const codeText = (await page.getByTestId('coupon-code').first().textContent()) ?? ''
    const voucherCode = codeText.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    expect(voucherCode.length).toBe(10)

    await page.goto('/account/coupons')
    await expect(page.getByRole('heading', { name: /הקופונים שלי|קופונים/ })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(new RegExp(voucherCode.slice(0, 5)))).toBeVisible()

    await customer.close()

    const supplier = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const scanPage = await supplier.newPage()
    await signInWithEmail(scanPage, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, '/supplier/scan')
    await scanPage.goto('/supplier/scan')
    await expect(scanPage.getByRole('heading', { name: 'סריקת שובר' })).toBeVisible({
      timeout: 15_000,
    })
    await expectHebrewRtl(scanPage)

    await scanPage.getByLabel('הקלדת קוד ידנית').fill(voucherCode)
    await scanPage.getByRole('button', { name: 'המשך' }).click()
    await expect(scanPage.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ })).toBeVisible()
    await scanPage.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ }).click()

    await expect(scanPage.getByText('השובר מומש בהצלחה')).toBeVisible({ timeout: 20_000 })
    await expect(scanPage.getByText('לגבייה מהלקוח עכשיו')).toBeVisible()

    await scanPage.goto('/supplier')
    await expect(scanPage.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible()
    await expect(scanPage.getByText('מימושים היום')).toBeVisible()
    await expect(scanPage.locator('body')).toContainText(/1|קופון בדיקות/)

    await supplier.close()

    const walletCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const walletPage = await walletCtx.newPage()
    await signInWithEmail(walletPage, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account/wallet')
    await walletPage.goto('/account/wallet')
    await expect(walletPage.getByRole('heading', { name: 'הארנק שלי' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(walletPage.getByText(/קאשבק על רכישה|היתרה שלך/)).toBeVisible()
    await walletCtx.close()
  })

  test('Google button is the primary CTA on the pay gate (no silent email-only)', async ({
    page,
  }) => {
    await clearBrowserSession(page)
    await addProductBySlug(page, E2E_COUPON_SLUG)

    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout/)
    await expect(page.getByRole('button', { name: 'יש ללחוץ כאן כדי להתחבר' })).toBeVisible()

    await page.goto('/login?next=%2Fcheckout')
    const google = page.getByRole('button', { name: /כניסה עם Google/ })
    await expect(google).toBeVisible()
    const googleBox = await google.boundingBox()
    const emailBox = await page.getByLabel('אימייל').boundingBox()
    expect(googleBox && emailBox && googleBox.y < emailBox.y).toBeTruthy()
  })
})
