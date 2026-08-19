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

/**
 * NOTHING MAY SCROLL SIDEWAYS ON THE NARROWEST PHONE STILL SOLD.
 *
 * 320 CSS pixels, not the project's Pixel 5 viewport, and that is the whole
 * point: a sweep at 320 on 2026-08-19 found the home page 6px too wide and the
 * category archive 5px too wide, while both measured clean at 393. Neither was
 * a rounding artefact.
 *
 * The trust bar put a 36px icon beside a two-line label inside a fifth of the
 * row, which is 68px of content in 64px of item and no padding change could
 * close it. The category card's footer put a 104px price beside a 37px
 * add-to-cart circle inside a 97px content box, and the circle was pushed to
 * x -5. Both fixes are commented where they live.
 *
 * The assertion is the document rather than any one element, because a page
 * that scrolls sideways is what a person actually feels, and because the
 * element responsible was different on each of the two pages.
 */
test.describe('no sideways scroll at 320px', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const path of [
    '/',
    '/products',
    '/cart',
    '/coupons',
    '/category/hot-deals',
    '/search?q=%D7%9E%D7%95%D7%A6%D7%A8',
    '/legal/terms',
  ]) {
    test(`${path} fits 320px`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')
      // The images below the fold decide the height, not the width, and waiting
      // for them here only makes the gate slower and flakier.
      await page.waitForTimeout(600)

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(
        scrollWidth,
        `${path} is ${scrollWidth}px wide in a 320px viewport`,
      ).toBeLessThanOrEqual(321)
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
