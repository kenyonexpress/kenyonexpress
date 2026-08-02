import { expect, test } from '@playwright/test'

/**
 * The gates around the two new screens, asserted from outside the app.
 *
 * These specs deliberately test the SIGNED-OUT half of the flow. Issuing a real
 * voucher and redeeming it needs a paid order, and the whole purchase leg is
 * blocked locally by the stock demo service key (STATE, Blocking Issues 1); a
 * spec that pretends otherwise would be red for a reason that has nothing to do
 * with these pages. What is testable without a database write is exactly what
 * must never regress: neither screen may render anything to a stranger, and the
 * bounce has to come back to the page that was asked for.
 */

test.describe('customer coupon page', () => {
  const SOME_ID = '00000000-0000-4000-8000-000000000000'

  test('sends a signed-out visitor to login and back to the same coupon', async ({ page }) => {
    await page.goto(`/coupon/${SOME_ID}`)
    await page.waitForURL(/\/login/)
    expect(new URL(page.url()).searchParams.get('next')).toBe(`/coupon/${SOME_ID}`)
  })

  test('never renders a code or a QR to a signed-out visitor', async ({ page }) => {
    await page.goto(`/coupon/${SOME_ID}`)
    await page.waitForURL(/\/login/)
    await expect(page.getByTestId('coupon-code')).toHaveCount(0)
    await expect(page.locator('img[src^="data:image"]')).toHaveCount(0)
  })
})

test.describe('supplier scan screen', () => {
  test('requires a supplier session', async ({ page }) => {
    await page.goto('/scan')
    await page.waitForURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('next')).toMatch(/\/supplier/)
  })

  test('supplier login landing sends strangers to shared login', async ({ page }) => {
    await page.goto('/supplier/login')
    await expect(page.getByRole('heading', { name: 'כניסה לאזור הספקים' })).toBeVisible()
    await page.getByRole('link', { name: 'התחברות לספקים' }).click()
    await page.waitForURL(/\/login/)
    expect(new URL(page.url()).searchParams.get('next')).toBe('/supplier')
  })

  test('keeps the old /supplier/scan address working', async ({ page }) => {
    // Printed cards and older QR codes name the long path. It redirects rather
    // than 404s, and the guard still applies on the way through.
    const response = await page.goto('/supplier/scan')
    expect(response?.status()).toBeLessThan(400)
    await page.waitForURL(/\/(scan|login)/)
  })
})

test.describe('voucher redemption route', () => {
  test('refuses a forged token without leaking whether a voucher exists', async ({ page }) => {
    await page.goto('/redeem/KEV1.ZmFrZQ.bm90LWEtc2lnbmF0dXJl')
    // Either the signature refusal or the login bounce is correct here; what is
    // not correct is any voucher detail appearing on the page.
    await expect(page.locator('body')).not.toContainText('לגבייה מהלקוח')
  })
})
