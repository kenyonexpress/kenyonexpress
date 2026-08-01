import { expect, test } from '@playwright/test'

test.describe('homepage', () => {
  test('loads with RTL layout and the Hebrew locale', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/KenyonExpress/)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'rtl')
    await expect(html).toHaveAttribute('lang', 'he')
  })

  test('renders product links with add-to-cart buttons', async ({ page }) => {
    await page.goto('/')

    const productLink = page.locator('a[href^="/product/"]').first()
    await expect(productLink).toBeVisible({ timeout: 15000 })

    // Deal cards expose add-to-cart via Hebrew aria-label (revealed on hover,
    // so assert presence rather than visibility)
    await expect(page.getByRole('button', { name: /הוסף .* לעגלה/ }).first()).toBeAttached()
  })

  /**
   * The deal card image has to occupy a box, not merely exist.
   *
   * This is an end-to-end test and not a unit one because jsdom has no layout
   * engine, and layout is the entire failure: `.p_con__image-wrap` sets no
   * height of its own and takes it from the in-flow image inside it. Giving
   * that image next/image's `fill` writes `position:absolute` as an inline
   * style, the wrap loses the only thing it was measuring, and it collapses.
   *
   * All 32 cards on the homepage shipped that way. The images were fetched and
   * decoded - naturalWidth 459 - and painted into a box of 239x0, so nothing
   * errored, no request failed, and the Lighthouse score the change was made
   * for went up. The page came out 3504px instead of 5492px and the homepage
   * pixel diff doubled to 22.4%. Every signal that was being watched said the
   * change was an improvement.
   */
  test('deal card images occupy a box, not just load', async ({ page }) => {
    await page.goto('/')
    const img = page.locator('.p_con__image').first()
    await expect(img).toBeVisible({ timeout: 15000 })

    const painted = await img.evaluate((el: HTMLImageElement) => ({
      height: Math.round(el.getBoundingClientRect().height),
      width: Math.round(el.getBoundingClientRect().width),
      naturalWidth: el.naturalWidth,
    }))

    expect(painted.naturalWidth, 'the image never decoded').toBeGreaterThan(0)
    // 245px is live's card image height, pinned in product-card-deals.css.
    // Asserting a real box rather than the exact number keeps this a guard
    // against collapse and not a second copy of the stylesheet.
    expect(painted.height, 'image box collapsed to zero height').toBeGreaterThan(100)
    expect(painted.width).toBeGreaterThan(100)
  })

  /**
   * A phone must not be handed the desktop hero raster.
   *
   * The five slide images sit in a full-bleed box that is only `h-[42%]` of the
   * slider, and the frames are near-square under `object-contain`, so height is
   * the constraint: measured at 320/360/390/412/768/1023 the painted width is a
   * constant 174-193px at every one of them. They declared `100vw` anyway, so a
   * 412px phone at dpr 1.75 asked the optimizer for 750px - four slides at
   * 55-96KB each to paint 193px.
   *
   * The assertion is on the `w` the browser actually picked out of the srcset,
   * because that is the byte count. A viewport is set explicitly rather than
   * inherited from the desktop project: this only means anything below 1024px.
   */
  test('the hero serves a phone-sized raster to a phone', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 823 })
    await page.goto('/')
    await page.waitForTimeout(2500)

    const picked = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        // The app slide's store badge lives in the copy column and is a
        // different box with its own sizes, so it is not one of these five.
        .filter((el) => !el.closest('.hero-copy-column'))
        .map((el) => (el as HTMLImageElement).currentSrc)
        .filter((src) => /hero(%2F|\/)slider/.test(src))
        .map((src) => Number(new URL(src, location.href).searchParams.get('w')))
        .filter((w) => Number.isFinite(w) && w > 0),
    )

    expect(picked.length, 'no hero slide image resolved').toBeGreaterThan(0)
    for (const w of picked) {
      // 384 is the rung above 193 * 1.75, and 256 is what a dpr-1 run picks.
      // Verified to separate the two states: with `100vw` back in place this
      // fails at 640 on a dpr-1 run and at 750 on a phone.
      expect(w, `hero slide fetched at w=${w} for a 193px paint`).toBeLessThanOrEqual(384)
    }
  })

  test('offers category navigation into the archives', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href^="/category/"]').first()).toBeAttached({ timeout: 15000 })
  })

  test('shows a cart control in the header before anything is added', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /עגלת קניות/ }).first()).toBeVisible()
  })

  test('search results page finds products', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('צימר')}`)
    await expect(page.getByRole('heading', { name: /תוצאות חיפוש/ })).toBeVisible()
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible()
  })

  test('short query shows the minimum-characters hint', async ({ page }) => {
    await page.goto('/search?q=a')
    await expect(page.getByText('הקלידו לפחות 2 תווים כדי לחפש')).toBeVisible()
  })

  test('a search term with SQL wildcards is treated as text, not a pattern', async ({ page }) => {
    // Guards the LIKE/PostgREST escaping fix (commit 876aae0): these must not
    // error the request or silently match everything.
    for (const term of ['%%', '100%_x', 'a,b']) {
      const response = await page.goto(`/search?q=${encodeURIComponent(term)}`)
      expect(response?.status(), term).toBe(200)
      await expect(page.getByRole('heading', { name: /תוצאות חיפוש/ })).toBeVisible()
    }
  })
})
