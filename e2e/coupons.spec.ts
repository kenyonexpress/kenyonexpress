import { expect, test } from '@playwright/test'

/**
 * The `(main)` route group - /coupons, /coupons/[id] and the two newsletter
 * screens - was laid out with a hard `grid-cols-[200px_1fr_250px]` at every
 * width, no breakpoint.
 *
 * The two fixed columns and the gaps come to 482px, so on a 412px phone the
 * `1fr` middle column, which is the page, was solved at **2px wide**. Measured
 * before the fix: 2px at 360/390/412/480, 37 at 600, 76.66 at 768. Every one of
 * those pages was a vertical sliver on a phone and nothing on them was
 * readable, while both sidebars rendered fine off to the side.
 *
 * The assertion is the ratio, not a pixel count: whatever the chrome around it
 * costs, the page column cannot be a minority of a phone screen.
 */
test.describe('(main) group on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('the coupons page gets the screen, not a 2px column', async ({ page }) => {
    await page.goto('/coupons')

    const main = page.locator('main')
    await expect(main).toBeVisible()

    const width = await main.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeGreaterThan(412 * 0.8)
  })

  test('the sidebars are absent rather than stacked above the content', async ({ page }) => {
    await page.goto('/coupons')

    // Stacking them would put a category list and three English promo banners
    // between the header and the first coupon on the narrowest screen.
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /קופונים פעילים/ })).toBeVisible()
  })
})

test.describe('coupons catalogue', () => {
  test('lists active coupon deals or says there are none', async ({ page }) => {
    await page.goto('/coupons')

    await expect(page.getByRole('heading', { name: /קופונים פעילים/ })).toBeVisible()
    // The catalogue is data, so either shape is correct; what must not happen
    // is a 500 or an empty document.
    const cards = page.locator('a[href^="/coupons/"]')
    const empty = page.getByText('אין קופונים פעילים כרגע')
    await expect(async () => {
      expect((await cards.count()) > 0 || (await empty.count()) > 0).toBe(true)
    }).toPass({ timeout: 10000 })
  })
})
