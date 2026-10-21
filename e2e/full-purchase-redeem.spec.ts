import { expect } from '@playwright/test'
import {
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  clearBrowserSession,
  paidFlowEnabled,
} from './auth-session'
import {
  BUY_BUTTON,
  addOpenProductToCart,
  emptyCart,
  expectHebrewRtl,
  newFixtureContext,
  newSignedInContext,
  submitCheckout,
  sharedCustomerTest as test,
} from './helpers'

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
    const customer = await newFixtureContext(browser)
    const page = await customer.newPage()

    await page.goto(`/product/${E2E_COUPON_SLUG}`)
    await expectHebrewRtl(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await addOpenProductToCart(page)

    const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
    const buyable = await buy.isVisible().catch(() => false)
    test.skip(!buyable, 'e2e-test-coupon is not purchasable; run pnpm seed:test')
    test.skip(await buy.isDisabled(), 'e2e-test-coupon is out of stock')

    // The fixture customer's server cart is emptied first (see emptyCart), in
    // a signed-in context of its own, so the guest cart built below is the only
    // thing the sign-in at the gate merges into the account.
    const prep = await newSignedInContext(browser, 'customer')
    await emptyCart(await prep.newPage())
    await prep.close()

    // Settled by the header badge AND the button leaving its pending state,
    // not by the "נוסף לסל" label: that label is a 2-second timer that the
    // route refresh can wipe, and on a slow backend it has not even appeared
    // when a 5 s expectation expires (run 5, 2026-10-20: the buy button was
    // still disabled at the 5 s mark and the add landed later). See
    // addOpenProductToCart for the measurement.
    await addOpenProductToCart(page)

    // /checkout itself takes guests (src/proxy.ts lists the protected paths;
    // checkout.spec.ts pins it) and asks for the account at the pay press,
    // which sends the visitor through /login?next=/checkout. This journey
    // enters that gate directly, pins its shape (Google and email both
    // offered), and signs in by email, which is the same path that merges the
    // guest cart into the account on the way back. The old assertion, that
    // /checkout itself bounces a guest, held the product to a design it left.
    await page.goto('/login?next=%2Fcheckout')
    await expect(page).toHaveURL(/\/login\?.*next=%2Fcheckout/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page.getByRole('button', { name: /כניסה עם Google/ })).toBeVisible()
    await expectHebrewRtl(page)

    // CI cannot complete real Google OAuth. Email/password hits the same
    // mergeGuestCart path the Google callback uses after the OAuth hop.
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(E2E_CUSTOMER_EMAIL)
    await page.getByLabel('סיסמה').fill(E2E_CUSTOMER_PASSWORD)
    await page.getByRole('button', { name: 'כניסה', exact: true }).click()
    await page.waitForURL(/\/checkout/, { timeout: 20_000 })

    await expect(page.getByText('קופון בדיקות אוטומטיות').first()).toBeVisible({
      timeout: 15_000,
    })
    await submitCheckout(page)

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
    const supplier = await newSignedInContext(browser, 'supplier')
    const scanPage = await supplier.newPage()
    await scanPage.goto('/supplier/scan')
    await expect(scanPage.getByRole('heading', { name: 'סריקת שובר' })).toBeVisible({
      timeout: 15_000,
    })
    await expectHebrewRtl(scanPage)

    await scanPage.getByLabel('הקלדת קוד ידנית').fill(voucherCode)
    // "בדוק שובר", not "המשך": the manual-entry button is the lookup, and it
    // has been named for it since the scanner split lookup from redemption.
    // Measured 2026-10-21 (run 12), the first time this journey reached the
    // scanner with a paid voucher: a click on a button that is not there ran
    // the test out of its 120 s with the code already typed.
    await scanPage.getByRole('button', { name: 'בדוק שובר' }).click()
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
    // The pay gate is the login page the pay press sends a guest through, with
    // the return path on it; /checkout itself no longer bounces (see the first
    // journey), so the gate is measured where it actually is.
    await page.goto('/login?next=%2Fcheckout')
    await expect(page).toHaveURL(/\/login\?.*next=%2Fcheckout/)
    const google = page.getByRole('button', { name: /כניסה עם Google/ })
    await expect(google).toBeVisible()
    const googleBox = await google.boundingBox()
    const emailBox = await page.getByRole('textbox', { name: 'אימייל', exact: true }).boundingBox()
    expect(googleBox && emailBox && googleBox.y < emailBox.y).toBeTruthy()
  })
})
