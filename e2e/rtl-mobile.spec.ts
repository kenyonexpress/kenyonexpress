import { expect, test } from '@playwright/test'
import {
  addOpenProductToCart,
  expectHebrewRtl,
  firstProductHref,
  openPurchasableProduct,
  raiseInstallBanner,
} from './helpers'

/**
 * RTL + phone viewport gates that must not regress independently of desktop.
 * The mobile Playwright project (Pixel 5) also runs the rest of the suite;
 * these specs pin the Hebrew document shell and a few phone-critical pages.
 */

test.describe('RTL document shell', () => {
  for (const path of [
    '/',
    '/login',
    '/products',
    '/cart',
    '/coupons',
    '/checkout',
    '/search?q=%D7%9E%D7%95%D7%A6%D7%A8',
    '/category/hot-deals',
    '/legal/terms',
    '/this-route-does-not-exist',
  ]) {
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
 *
 * THE LIST IS EVERY PUBLIC ROUTE, AND THAT IS THE POINT. It held seven routes,
 * and the stage-8 sweep on 2026-08-19 (`scripts/_rtl-sweep.mjs`, 27 routes at
 * 320 and 393) found exactly one page still overflowing: the product page,
 * which was not in it. Its buy row carries 140px of quantity field, a 4px gap
 * and a 192px add-to-cart button, all measured off the live desktop template,
 * so 336px of fixed width sat in a 290px column. The same shape as the a11y
 * sweep of the morning: the routes inside the gate were clean and the ones
 * outside it were not.
 *
 * The product page is added below through a real catalogue link rather than a
 * hardcoded slug, because the seeded slugs change and a 404 measures 320px wide
 * and passes.
 */
test.describe('no sideways scroll at 320px', () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const path of [
    '/',
    '/products',
    '/cart',
    '/checkout',
    '/contact',
    '/coupons',
    '/suppliers',
    '/supplier/login',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/category/hot-deals',
    '/category/baby-kids',
    '/category/phones-computers',
    '/search?q=%D7%9E%D7%95%D7%A6%D7%A8',
    '/legal/terms',
    '/legal/privacy',
    '/legal/returns',
    '/legal/accessibility',
    '/terms-and-conditions',
    '/privacy-policy',
    '/offline',
    '/this-route-does-not-exist',
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

  /**
   * THE CHECKOUT IN THE LIST ABOVE IS NOT THE CHECKOUT.
   *
   * `/checkout` with an empty cart redirects to `/cart`, so that entry measures
   * the cart at 320px under this route's name and the real form has never been
   * width-tested at all.
   *
   * Since D25 there is no wizard below 768: checkout-page.css lays every step
   * section out as one long page, which is live's own mobile layout, and hides
   * the stepper and the per-step continue buttons. That is BETTER for this
   * gate, not worse -- every field of every step is on screen at once, so one
   * measurement covers what four wizard walks used to. The old version of this
   * test advanced with "המשך", which no longer exists at this width.
   */
  test('the seeded single-page checkout fits 320px, every section at once', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/checkout')
    await page.waitForLoadState('domcontentloaded')
    expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain(
      '/checkout',
    )

    // The mobile layout really is the single page: the stepper is gone and
    // the fields of steps 1, 2 and 4 are all visible with nothing clicked.
    await expect(page.locator('.checkout-steps')).toBeHidden()
    await expect(page.locator('#co-first-name')).toBeVisible()
    await expect(page.locator('#co-city')).toBeVisible()
    await expect(page.locator('.checkout-pay-btn')).toBeVisible()

    // Filled fields, because Hebrew text in the inputs is what widens an RTL
    // form that only fits while empty.
    await page.fill('#co-first-name', 'אופיר')
    await page.fill('#co-last-name', 'בדיקה')
    await page.fill('#co-phone', '0501234567')
    await page.fill('#co-email', 'qa@example.com')
    await page.fill('#co-city', 'תל אביב')
    await page.fill('#co-street', 'דיזנגוף')
    await page.fill('#co-number', '10')
    await page.waitForTimeout(400)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(
      scrollWidth,
      `the single-page checkout is ${scrollWidth}px wide in a 320px viewport`,
    ).toBeLessThanOrEqual(321)
  })

  /**
   * The cart panel has no URL, so it is in no route list. It opens over the
   * product page on add-to-cart, at the width where a fixed panel is most
   * likely to push the document sideways.
   */
  test('the open cart panel fits 320px', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    const panel = page.getByRole('dialog', { name: 'עגלת קניות' })
    await expect(
      panel,
      'add-to-cart did not open the cart panel; nothing was measured',
    ).toBeVisible()
    await page.waitForTimeout(400)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(
      scrollWidth,
      `the open cart panel makes the document ${scrollWidth}px wide in a 320px viewport`,
    ).toBeLessThanOrEqual(321)
  })

  /**
   * The install banner is `fixed inset-x-3` with an icon, two lines of text and
   * two buttons in one row, which is the shape that overflows first. It has no
   * URL and Chrome only fires the event that raises it when its own install
   * heuristics are met, so it is in no route list and no normal run sees it.
   */
  test('the install banner fits 320px', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const banner = await raiseInstallBanner(page)
    await expect(banner, 'the install banner did not render; nothing was measured').toBeVisible()
    await page.waitForTimeout(300)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(
      scrollWidth,
      `the install banner makes the document ${scrollWidth}px wide in a 320px viewport`,
    ).toBeLessThanOrEqual(321)
  })

  test('a product page fits 320px', async ({ page }) => {
    const href = await firstProductHref(page)
    await page.goto(href)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(600)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth, `${href} is ${scrollWidth}px wide in a 320px viewport`).toBeLessThanOrEqual(
      321,
    )
  })
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
