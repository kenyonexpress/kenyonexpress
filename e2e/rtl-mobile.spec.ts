import { expect, test } from '@playwright/test'
import { expectHebrewRtl } from './helpers'

/**
 * RTL + phone viewport gates that must not regress independently of desktop.
 * The mobile Playwright project (Pixel 5) also runs the rest of the suite;
 * these specs pin the Hebrew document shell and a few phone-critical pages.
 */

test.describe('RTL document shell', () => {
  for (const path of ['/', '/login', '/products', '/cart', '/coupons']) {
    test(`${path} is lang=he dir=rtl`, async ({ page }) => {
      await page.goto(path)
      await expectHebrewRtl(page)
    })
  }
})

test.describe('mobile storefront chrome', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('homepage brand and cart control fit a phone width', async ({ page }) => {
    await page.goto('/')
    await expectHebrewRtl(page)
    await expect(page.getByRole('button', { name: /עגלת קניות/ }).first()).toBeVisible()

    const main = page.locator('main').first()
    await expect(main).toBeVisible()
    const width = await main.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeGreaterThan(390 * 0.85)
  })

  test('login gate stays usable on a phone', async ({ page }) => {
    await page.goto('/login?next=/checkout')
    await expectHebrewRtl(page)
    await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible()
    await expect(page.getByRole('button', { name: /כניסה עם Google/ })).toBeVisible()

    const google = page.getByRole('button', { name: /כניסה עם Google/ })
    const box = await google.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThan(200)
  })

  test('supplier scan login bounce keeps next path on phone', async ({ page }) => {
    await page.goto('/supplier/scan')
    await page.waitForURL(/\/login/)
    expect(new URL(page.url()).searchParams.get('next')).toMatch(/\/supplier\/scan/)
    await expectHebrewRtl(page)
  })
})
