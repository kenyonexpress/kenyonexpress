import percySnapshot from '@percy/playwright'
import { expect, test } from '@playwright/test'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/**
 * Percy visual regression over the storefront funnel.
 *
 * This spec lives in its own Playwright project (`visual`, see
 * playwright.config.ts) and is NOT part of the chromium / mobile-chrome runs:
 * it exists to be driven by `percy exec -- playwright test --project=visual`,
 * which uploads each snapshot's DOM to Percy for rendering at the three design
 * widths in .percy.yml (380 / 768 / 1440) and diffs it against the approved
 * baseline of the base branch.
 *
 * Without a Percy agent (no PERCY_TOKEN, or run outside `percy exec`),
 * `percySnapshot` logs once that Percy is not running and returns, so the spec
 * still walks the funnel and the assertions between snapshots still hold. It
 * simply produces no visual comparison, and says so.
 *
 * Each step asserts the page is settled BEFORE the snapshot: a snapshot of a
 * skeleton or a loading state is a baseline nobody wants and a diff nobody can
 * read. The snapshot names are stable strings, not URLs, because Hebrew slugs
 * are discovered at runtime and would rename the baseline every seed.
 */

test.describe('visual regression (Percy)', () => {
  test('home', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / home')
  })

  test('catalogue', async ({ page }) => {
    await page.goto('/products')
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / catalogue')
  })

  test('product', async ({ page }) => {
    await openPurchasableProduct(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'פרטי ספק' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / product')
  })

  test('cart, empty and with one line', async ({ page }) => {
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / cart / empty')

    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/cart')
    await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
    await expect(page.getByRole('link', { name: /המשך לתשלום/ }).first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / cart / one line')
  })

  test('checkout form (guest)', async ({ page }) => {
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / checkout / guest form')
  })

  test('login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await percySnapshot(page, 'storefront / login')
  })
})
