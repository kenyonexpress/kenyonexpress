import { expect, test } from '@playwright/test'

/**
 * The gates around the customer coupon page and the supplier scan screen.
 *
 * These specs deliberately test the SIGNED-OUT half of the flow. Issuing a real
 * voucher and redeeming it needs a paid order (see full-purchase-redeem.spec.ts).
 * What is testable without a database write is exactly what must never regress:
 * neither screen may render anything to a stranger, and the bounce has to come
 * back to the page that was asked for.
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
    await page.goto('/supplier/scan')
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

  test('keeps the short /scan address as a login bounce into supplier scan', async ({ page }) => {
    // Printed cards may still name /scan. next.config redirects it to
    // /supplier/scan, and the supplier guard then sends strangers to login.
    const response = await page.goto('/scan')
    expect(response?.status()).toBeLessThan(400)
    await page.waitForURL(/\/login/)
    expect(new URL(page.url()).searchParams.get('next')).toMatch(/\/supplier\/scan/)
  })
})
