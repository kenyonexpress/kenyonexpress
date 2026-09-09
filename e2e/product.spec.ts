import { expect, test } from '@playwright/test'
import { firstProductHref, openFirstProduct } from './helpers'

test.describe('product page', () => {
  test('shows name, shekel price, breadcrumb and purchase button', async ({ page }) => {
    await openFirstProduct(page)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // SCOPED TO THE PRODUCT'S OWN PRICE, not the first ₪ in the document.
    // `getByText(/₪/).first()` matched whatever came first in DOM ORDER, and
    // D21 moved the off-canvas drawer ahead of the main content in the header
    // markup -- so it started resolving to the drawer's hidden "עד ₪99"
    // category link and failing on a page whose price was painted correctly.
    // The assertion wanted the price; now it names it.
    await expect(page.locator('.pdp-summary__price')).toBeVisible()
    await expect(page.locator('.pdp-summary__price')).toContainText('₪')
    await expect(page.getByRole('navigation', { name: 'נתיב ניווט' })).toBeVisible()
    // .first(): related-products cards carry their own add-to-cart buttons
    await expect(
      page.getByRole('button', { name: /הוסף לסל|קנה עכשיו|אזל מהמלאי|לא זמין לרכישה/ }).first(),
    ).toBeVisible()
  })

  test('offers WhatsApp share', async ({ page }) => {
    await openFirstProduct(page)
    await expect(page.getByRole('button', { name: 'שתפו בוואטסאפ' })).toBeVisible()
  })

  test('renders right-to-left with a Hebrew document title', async ({ page }) => {
    await openFirstProduct(page)

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    const heading = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? ''
    expect(heading.length).toBeGreaterThan(0)
    await expect(page).toHaveTitle(
      new RegExp(heading.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  })

  test('the breadcrumb links back to a real category archive', async ({ page }) => {
    await openFirstProduct(page)

    const crumb = page
      .getByRole('navigation', { name: 'נתיב ניווט' })
      .locator('a[href^="/category/"]')
      .first()
    test.skip((await crumb.count()) === 0, 'product has no category crumb')

    await crumb.click()
    await page.waitForURL(/\/category\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  /**
   * See the twin of this test in category.spec.ts for the full reasoning.
   *
   * Short version: the product page now streams a prerendered shell before it
   * knows whether the slug exists, so `notFound()` can no longer change the
   * status line. Next injects `<meta name="robots" content="noindex">` instead,
   * and that tag - not the status - is what keeps a dead slug out of the index.
   * Asserting the tag is stricter than asserting the status was.
   */
  test('an unknown product slug is noindex and shows the not-found page', async ({
    page,
    request,
  }) => {
    const html = await (await request.get('/product/no-such-product-slug-12345')).text()
    expect(html).toContain('<meta name="robots" content="noindex"/>')

    await page.goto('/product/no-such-product-slug-12345')
    await expect(page.getByRole('heading', { name: 'הדף שחיפשתם לא נמצא' })).toBeVisible()
  })

  test('a product page is reachable directly by URL, not only by clicking through', async ({
    page,
  }) => {
    const href = await firstProductHref(page)
    const response = await page.goto(href)

    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  /**
   * The related-products cards must not order more pixels than their box has.
   *
   * `sizes` on this card used to name the grid COLUMN (50vw / 33vw / 25vw) and
   * not the image, ignoring the page gutter, the grid gap and the card padding.
   * The cards paint 204px at desktop widths and were fetching w=384; on a
   * 412px phone at dpr 2 the page pulled 236.3KB of images where 117.0KB
   * covers every box.
   *
   * The rule, not the number: a candidate wider than 1.5x the device pixels the
   * box actually has is over-ordering. At this project's 1280px default that is
   * 204 device pixels, so 256 passes and 384 - the old value - does not.
   */
  test('related-product thumbnails do not over-order pixels', async ({ page }) => {
    await openFirstProduct(page)

    const grid = page.locator('.pdp-related__grid')
    await expect(grid.locator('img').first()).toBeAttached({ timeout: 15000 })
    // The grid is below the fold and the thumbnails are lazy, so without the
    // scroll `currentSrc` is the empty string and every assertion below passes
    // on nothing. That is exactly how the first version of this test passed
    // against the bug it was written for.
    await grid.scrollIntoViewIfNeeded()
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.pdp-related__grid img')).every(
          (el) => (el as HTMLImageElement).currentSrc !== '',
        ),
      undefined,
      { timeout: 15000 },
    )

    const shots = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.pdp-related__grid img')).map((el) => {
        const img = el as HTMLImageElement
        const painted = img.getBoundingClientRect().width
        const w = new URL(img.currentSrc, location.href).searchParams.get('w')
        return { painted, ordered: Number(w), src: img.currentSrc.slice(-60) }
      }),
    )
    const dpr = await page.evaluate(() => window.devicePixelRatio)

    // The bound is the smallest RUNG that covers the paint, not a linear
    // multiple of it. `painted * dpr * 1.5` assumes the browser can request any
    // width; it cannot, it picks from next's ladder. On a Pixel 5 a 149.5px
    // thumbnail at dpr 2.75 needs 411 device pixels, and the ladder goes
    // 384 -> 640 with nothing between, so 640 is the only correct choice and
    // the old tolerance of 616 called the right answer a regression. The
    // over-ordering this guards against is picking a rung ABOVE the one that
    // covers the paint, which is still caught.
    const RUNGS = [16, 32, 48, 64, 96, 128, 256, 288, 384, 640, 750, 828, 1080, 1200, 1920, 2048]
    const rungFor = (devicePx: number) => RUNGS.find((r) => r >= devicePx) ?? RUNGS.at(-1)

    expect(shots.length).toBeGreaterThan(0)
    for (const s of shots) {
      // A candidate of 0 means currentSrc carried no `w`, i.e. the image never
      // went through the optimizer. That is a failure, not a pass.
      expect(s.ordered, `${s.src}: no w= in currentSrc`).toBeGreaterThan(0)
      const allowed = rungFor(s.painted * dpr) as number
      expect(
        s.ordered,
        `${s.src}: painted ${s.painted} at dpr ${dpr} needs ${Math.ceil(s.painted * dpr)}px, rung ${allowed} covers it`,
      ).toBeLessThanOrEqual(allowed)
    }
  })
})
