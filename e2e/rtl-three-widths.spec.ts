import { expect, test } from '@playwright/test'

/**
 * RTL at the three design widths (marathon step 10): 380 / 768 / 1440 --
 * the exact trio compare.mjs measures against the live site.
 *
 * rtl-mobile.spec.ts guards the 320px floor; this one guards the widths the
 * design queue was signed off at, and specifically the D21/D24 regression
 * that shipped twice: a flex row whose `justify-content` or `order` flips
 * under dir=rtl, so the primary content drifts to the LEFT half of the
 * viewport. Structural assertions, not screenshots, so the gate has no
 * baseline images to rot.
 */

const WIDTHS = [380, 768, 1440] as const
const PAGES = ['/', '/products', '/cart'] as const

for (const width of WIDTHS) {
  test.describe(`rtl at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const path of PAGES) {
      test(`${path} stays rtl with no sideways scroll`, async ({ page }) => {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
        await expect(page.locator('html')).toHaveAttribute('lang', 'he')

        const { scrollWidth, clientWidth, direction } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          direction: getComputedStyle(document.body).direction,
        }))
        expect(direction).toBe('rtl')
        expect(
          scrollWidth,
          `${path} is ${scrollWidth}px wide in a ${width}px viewport`,
        ).toBeLessThanOrEqual(clientWidth + 1)
      })
    }

    test('the page heading starts on the RIGHT half, not flipped to the left', async ({ page }) => {
      // The D21/D24 bug in one number: under a correct RTL layout the first
      // heading's right edge sits in the right half of the viewport. When a
      // row flips, the text block lands flush left.
      await page.goto('/products')
      const heading = page.getByRole('heading', { level: 1 }).first()
      await expect(heading).toBeVisible()
      const box = await heading.boundingBox()
      expect(box, 'heading bounding box').not.toBeNull()
      if (box) {
        expect(
          box.x + box.width,
          `h1 right edge at ${box.x + box.width} in a ${width}px viewport`,
        ).toBeGreaterThan(width / 2)
      }
    })
  })
}
