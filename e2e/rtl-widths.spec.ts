import { type Page, expect, test } from '@playwright/test'

/**
 * Hebrew RTL at the three widths this project measures everything at.
 *
 * WHY 380 / 768 / 1440 AND NOT "MOBILE / DESKTOP". They are the widths
 * `scripts/snapshot-live.mjs` renders the live site at, so `refs/ke_live_380
 * .png`, `_768` and `_1440` and every column in `refs/ke_live_computed.json`
 * are measured there. A layout gate on any other width would be red or green
 * against numbers no reference exists for.
 *
 * WHY dir="rtl" IS NOT ENOUGH ON ITS OWN. The attribute is on `<html>` and has
 * been correct throughout every RTL bug this project has had. What breaks is
 * one level down: a component with a hardcoded `text-left`, a grid whose
 * columns are declared in physical rather than logical order, a `padding-left`
 * that should have been `padding-inline-start`. All of those render a
 * dir="rtl" document with left-aligned Hebrew inside it. So each assertion here
 * is measured off the painted box, not read off an attribute.
 *
 * The overflow check is the same argument. `grid-cols-[200px_1fr_250px]` with
 * no breakpoint solved the page column at 2px on a phone and pushed the rest
 * off-screen; the document still said dir="rtl" the entire time. See
 * coupons.spec.ts, which pins that specific regression at 412px.
 */

const WIDTHS = [
  { width: 380, height: 820, label: '380 (phone)' },
  { width: 768, height: 1024, label: '768 (tablet)' },
  { width: 1440, height: 900, label: '1440 (desktop)' },
] as const

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'catalogue', path: '/products' },
  { name: 'cart', path: '/cart' },
  { name: 'coupons', path: '/coupons' },
] as const

/**
 * Where the painted text of an element actually sits inside its own content
 * box, as a pair of gaps in CSS pixels.
 *
 * Measured with a Range over the text nodes rather than from the element's own
 * box: a block element is full-width whatever its alignment, so its rect says
 * nothing about which edge the glyphs are on. The Range gives the glyphs.
 */
async function textEdgeGaps(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null

    const range = document.createRange()
    range.selectNodeContents(el)
    const textRect = range.getBoundingClientRect()
    range.detach()

    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const padStart = Number.parseFloat(style.paddingInlineStart) || 0
    const padEnd = Number.parseFloat(style.paddingInlineEnd) || 0

    if (textRect.width === 0) return null

    return {
      // In an RTL line the glyphs hug the RIGHT edge, so rightGap is ~0 and
      // leftGap absorbs whatever the line does not fill.
      leftGap: textRect.left - (box.left + padEnd),
      rightGap: box.right - padStart - textRect.right,
      direction: style.direction,
      textAlign: style.textAlign,
      width: box.width,
    }
  }, selector)
}

for (const { width, height, label } of WIDTHS) {
  test.describe(`RTL at ${label}`, () => {
    test.use({ viewport: { width, height } })

    for (const { name, path } of PAGES) {
      test(`${name} declares Hebrew RTL on the document`, async ({ page }) => {
        await page.goto(path)

        const html = page.locator('html')
        await expect(html).toHaveAttribute('dir', 'rtl')
        await expect(html).toHaveAttribute('lang', 'he')

        // The attribute is a declaration; this is the computed consequence.
        // A stylesheet that set `direction: ltr` further down would satisfy the
        // two assertions above and break the page anyway.
        const direction = await page.evaluate(() => getComputedStyle(document.body).direction)
        expect(direction).toBe('rtl')
      })

      test(`${name} does not scroll sideways`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('domcontentloaded')

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        // One pixel of slack for subpixel rounding on fractional device ratios.
        expect(overflow, `${name} overflows its viewport horizontally`).toBeLessThanOrEqual(1)
      })
    }

    test('the main heading paints against the right edge, not the left', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      const heading = page.locator('h1, h2').first()
      await expect(heading).toBeVisible({ timeout: 15_000 })

      const gaps = await textEdgeGaps(page, 'h1, h2')
      expect(gaps, 'no measurable heading text on the home page').not.toBeNull()
      if (!gaps) return

      expect(gaps.direction).toBe('rtl')

      // A heading that fills its line tells us nothing either way, so it is only
      // a failure when there IS slack and the slack is on the wrong side.
      const slack = gaps.leftGap + gaps.rightGap
      if (slack > 4) {
        expect(
          gaps.rightGap,
          `heading is left-aligned: ${gaps.rightGap.toFixed(1)}px from the right, ${gaps.leftGap.toFixed(1)}px from the left`,
        ).toBeLessThan(gaps.leftGap)
      }
    })

    test('the catalogue cards read right to left', async ({ page }) => {
      await page.goto('/products')
      const cards = page.locator('a[href^="/product/"]')
      await expect(cards.first()).toBeVisible({ timeout: 15_000 })

      // The first card in source order must be the RIGHTMOST one on screen.
      // A grid declared with physical column order looks identical in a
      // screenshot until you ask which card the keyboard reaches first.
      const positions = await cards.evaluateAll((nodes) =>
        nodes.slice(0, 4).map((n) => n.getBoundingClientRect()),
      )
      const sameRow = positions.filter(
        (rect) => Math.abs(rect.top - (positions[0]?.top ?? 0)) < 8 && rect.width > 0,
      )
      test.skip(sameRow.length < 2, 'fewer than two cards share a row at this width')

      for (let i = 1; i < sameRow.length; i += 1) {
        expect(
          sameRow[i]?.left,
          'card order is left-to-right; the first card in the DOM must sit furthest right',
        ).toBeLessThan(sameRow[i - 1]?.left ?? 0)
      }
    })

    test('the header cart control sits on the correct side of the bar', async ({ page }) => {
      await page.goto('/')

      const cart = page.getByRole('button', { name: /עגלת קניות/ }).first()
      await expect(cart).toBeVisible({ timeout: 15_000 })

      const box = await cart.boundingBox()
      expect(box).not.toBeNull()
      if (!box) return

      // In an RTL header the cart lives on the LEFT (the inline end). This is
      // the one assertion here that would flip if the site ever shipped an
      // LTR locale, which is exactly why it is written against the measured
      // side rather than a class name.
      expect(box.x + box.width / 2, 'cart control drifted to the inline start').toBeLessThan(
        width / 2,
      )
    })
  })
}
