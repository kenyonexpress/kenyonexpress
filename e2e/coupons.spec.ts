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

  /**
   * AN ID NOBODY ISSUED MUST 404, NOT 200.
   *
   * The lookup sat inside a `<Suspense>` whose fallback was the card outline,
   * so the shell went out with the status line and `notFound()` could not
   * change it: every uuid on earth answered `200 OK` with a not-found body.
   * The boundary is gone - see the note above the page - and there was nothing
   * to lose with it, since this route has no `generateStaticParams` and reads
   * through the cookie-scoped client.
   */
  test('an id that was never issued 404s', async ({ request }) => {
    const response = await request.get('/coupons/00000000-0000-0000-0000-000000000000')
    expect(response.status()).toBe(404)
  })

  /**
   * THE DETAIL PAGE MUST NOT QUOTE THE ABOLISHED 10%/90% SPLIT.
   *
   * `platform_price` is an absolute amount an admin sets per deal. This page
   * printed "(10%)" and "(90%)" next to the two figures and, when the price was
   * missing, invented one at a tenth of the sticker - the model abolished on
   * 2026-07-24 and already corrected in `CouponCard`, which links here.
   *
   * The seed rows are all exactly a tenth of their sticker, so the labels read
   * as true and no assertion about the NUMBERS would catch this. The absence of
   * the percentage text is what the test asserts, and it is checked in the
   * served HTML so it holds for a reader that runs no scripts.
   */
  test('the detail page names the split in shekels, not in percentages', async ({
    page,
    request,
  }) => {
    await page.goto('/coupons')
    const href = await page.locator('a[href^="/coupons/"]').first().getAttribute('href')
    test.skip(!href, 'no active coupon deals to open')

    const html = await (await request.get(href as string)).text()
    expect(html).toContain('עכשיו')
    expect(html, 'the 10%/90% split was abolished on 2026-07-24').not.toContain('(10%)')
    expect(html, 'the 10%/90% split was abolished on 2026-07-24').not.toContain('(90%)')
  })
})
