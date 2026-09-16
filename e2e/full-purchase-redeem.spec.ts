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
import { addOpenProductToCart, expectHebrewRtl } from './helpers'

/**
 * End-to-end money path against Cardcom mock + seeded fixtures:
 * guest cart → guest checkout form → sign-in on the pay leg (email in CI;
 * the Google hop uses the same /auth/callback mergeGuestCart path) →
 * mock hosted page → finalize → coupon with QR → supplier scan redeem.
 *
 * REWRITTEN 2026-09-16 for the guest-at-pay gate. This spec used to pin the
 * OLD shape — an anonymous /checkout bouncing to /login — and had been red
 * since the checkout became guest-fillable with sign-in demanded on the pay
 * press (see src/app/(store)/checkout/page.tsx and checkout.spec.ts, which
 * pins the gate itself). CI cannot complete the real Google OAuth hop, so
 * the paid leg signs in with the seeded email user before paying; the
 * guest-notice assertion below is what keeps the Google-at-pay design pinned.
 *
 * Requires:
 *   - scripts/seed-test-data.mjs (products + customer + supplier member)
 *   - CARDCOM_USE_MOCK=true on the app under test (Playwright webServer env)
 *
 * Skip with E2E_PAID_FLOW=0 when the shared DB cannot host fixtures.
 */

/** Walk the stepped checkout form from wherever it starts to the confirm step.
 * A returning customer with a saved address starts past the steps they have
 * answered, so each leg is conditional on its fields being on screen. */
async function walkCheckoutStepsToConfirm(page: import('@playwright/test').Page): Promise<void> {
  // Field ids rather than labels: the footer newsletter box also answers to
  // "כתובת אימייל", so labels are ambiguous the moment the footer renders.
  // Step 1: personal details.
  if (
    await page
      .locator('#co-first-name')
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator('#co-first-name').fill('בדיקה')
    await page.locator('#co-last-name').fill('אוטומטית')
    await page.locator('#co-phone').fill('0501234567')
    await page.locator('#co-email').fill(E2E_CUSTOMER_EMAIL)
    await page.getByRole('button', { name: 'המשך', exact: true }).click()
  }

  // Step 2: address (required even for coupon-only carts).
  if (
    await page
      .locator('#co-city')
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator('#co-city').fill('תל אביב')
    await page.locator('#co-street').fill('הרצל')
    await page.locator('#co-number').fill('1')
    await page.getByRole('button', { name: 'המשך', exact: true }).click()
  }

  // Step 3: review asks nothing; move on to the confirm step.
  const toConfirm = page.getByRole('button', { name: 'המשך לאישור' })
  if (await toConfirm.isVisible().catch(() => false)) {
    await toConfirm.click()
  }

  await expect(page.locator('input[name="accept_terms"]')).toBeVisible()
}

test.describe('full purchase to redeem @checkout @redeem @money', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('guest coupon cart → guest checkout → email sign-in at pay → mock pay → voucher → supplier redeem', async ({
    browser,
  }) => {
    const customer = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
    const page = await customer.newPage()

    await page.goto(`/product/${E2E_COUPON_SLUG}`)
    await expectHebrewRtl(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await addOpenProductToCart(page)

    // The guest-at-pay gate: /checkout serves the anonymous visitor the form,
    // with the returning-customer sign-in offered rather than demanded.
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('קונית כאן בעבר?')).toBeVisible()
    await expectHebrewRtl(page)

    // CI cannot complete real Google OAuth. Email/password hits the same
    // mergeGuestCart path the Google callback uses after the OAuth hop.
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/checkout')
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('קופון בדיקות אוטומטיות')).toBeVisible()

    await walkCheckoutStepsToConfirm(page)
    await page.locator('input[name="accept_terms"]').check()
    await page.getByRole('button', { name: 'שליחת הזמנה' }).click()

    // Mock Cardcom's hosted page IS the return URL: the payment iframe loads
    // /checkout/return and PaymentFrameBreakout moves the top window there.
    // reconcile verifies the in-memory deal and finalizes (issues vouchers).
    await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
      timeout: 45_000,
    })
    await expect(page.locator('.coupon-card__code').first()).toBeVisible()
    await expect(page.locator('.coupon-card__qr img').first()).toBeVisible()
    await expectHebrewRtl(page)

    const codeText = (await page.locator('.coupon-card__code').first().textContent()) ?? ''
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
    await scanPage.getByRole('button', { name: 'המשך' }).click()
    await expect(scanPage.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ })).toBeVisible()
    await scanPage.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ }).click()

    await expect(scanPage.getByText('השובר מומש בהצלחה')).toBeVisible({ timeout: 20_000 })
    await expect(scanPage.getByText('לגבייה מהלקוח עכשיו')).toBeVisible()

    await supplier.close()
  })

  test('the identity ask sits on the pay leg: guest reaches the form, Google leads on /login', async ({
    page,
  }) => {
    await clearBrowserSession(page)
    await page.goto(`/product/${E2E_COUPON_SLUG}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await addOpenProductToCart(page)

    // A guest with a populated cart gets the checkout form, not a bounce, and
    // the returning-customer sign-in is an offer inside the page.
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()
    await expect(page.getByText('קונית כאן בעבר?')).toBeVisible()

    // On the login page itself Google stays the primary CTA, above email.
    await page.goto('/login?next=%2Fcheckout')
    const google = page.getByRole('button', { name: /כניסה עם Google/ })
    await expect(google).toBeVisible()
    const googleBox = await google.boundingBox()
    const emailBox = await page.getByLabel('אימייל').boundingBox()
    expect(googleBox && emailBox && googleBox.y < emailBox.y).toBeTruthy()
  })
})
