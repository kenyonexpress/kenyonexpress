import { expect, test } from '@playwright/test'

/**
 * COMPONENT 02, THE MASTHEAD, read off the rendered page at the three widths
 * compare.mjs measures (380 / 768 / 1440), after the UX03 polish.
 *
 * `header-polish-gate.test.ts` proves the classes and tokens are in the
 * source; this proves what the browser does with them, which is where each
 * of the four UX03 defects lived:
 *
 *   logo     height-bound 26px drew 98.8 wide where live paints 100
 *   cluster  the handheld cart carried its price, so the glyph sat at x45
 *            where live has it on the gutter at x15
 *   badge    one 16px yellow circle on both headers; live has a 20px dark
 *            one below xl and a 21px yellow one from it, both at the glyph's
 *            bottom-left
 *   focus    the site ring was drawn on the input and clipped by the pill's
 *            overflow; live lightens the border to #ffeb80
 *
 * Structural assertions only, no screenshots, so there is no baseline to rot.
 * The live numbers are from refs/ke_live_home.html's stylesheet and the
 * before-state from logs/ux03/before*.json, both 14.10.2026.
 */

const MIRROR_KEY = 'ke_cart_mirror_v1'
const GUTTER = 15
const GLYPH = 22
const CELL = 44

type Box = { x: number; y: number; width: number; height: number }

function header(page: import('@playwright/test').Page) {
  return page.locator('header').first()
}

/**
 * The visible cart trigger. Both clusters are in the DOM at every width (the
 * handheld one is `xl:hidden`, the masthead one `hidden xl:flex`), so a bare
 * `.first()` is the handheld trigger even at 1440.
 */
function cartTrigger(page: import('@playwright/test').Page) {
  return header(page).locator('[data-mini-cart-trigger]').filter({ visible: true })
}

/** The visible cart trigger's glyph. */
function cartGlyph(page: import('@playwright/test').Page) {
  return cartTrigger(page).locator('svg')
}

async function box(locator: import('@playwright/test').Locator): Promise<Box> {
  const b = await locator.boundingBox()
  expect(b, 'element has a box').not.toBeNull()
  return b as Box
}

/**
 * Three items in the cart, seen through the mirror alone: `/api/cart` is cut
 * so the server never answers, the store stays unconfirmed and the badge reads
 * the persisted count. This is the state the probe measured the badge in.
 */
async function withMirroredCart(page: import('@playwright/test').Page, count: number) {
  await page.route('**/api/cart**', (route) => route.abort())
  await page.addInitScript(
    ([key, n]) => {
      localStorage.setItem(key as string, JSON.stringify({ state: { mirrorCount: n }, version: 0 }))
    },
    [MIRROR_KEY, count] as const,
  )
}

for (const width of [380, 768] as const) {
  test.describe(`handheld header at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('the logo is width-bound at live’s 100px', async ({ page }) => {
      await page.goto('/')
      const logo = await box(header(page).locator('img').first())
      expect(logo.width).toBeCloseTo(100, 0)
      // 380x100 file at 100 wide: 26.3 tall, not a clipped 26.
      expect(logo.height).toBeGreaterThan(26)
      expect(logo.height).toBeLessThan(27)
    })

    test('the cluster is three 44px cells with the cart glyph on the gutter and no price', async ({
      page,
    }) => {
      await page.goto('/')
      const h = header(page)
      const cart = await box(cartGlyph(page))
      expect(cart.width).toBe(GLYPH)
      expect(cart.x).toBeCloseTo(GUTTER, 0)

      const heart = h.getByRole('link', { name: 'המועדפים שלי' }).filter({ visible: true })
      const search = h.getByRole('button', { name: 'חיפוש מוצרים' })
      const heartBox = await box(heart)
      const searchBox = await box(search)
      expect(heartBox.width).toBe(CELL)
      expect(heartBox.height).toBe(CELL)
      expect(searchBox.width).toBe(CELL)
      expect(searchBox.height).toBe(CELL)
      // Cells touch at a 44px pitch, cart then heart then search from the left.
      const heartGlyph = await box(heart.locator('svg'))
      const searchGlyph = await box(search.locator('svg'))
      expect(heartGlyph.x).toBeCloseTo(cart.x + CELL, 0)
      expect(searchGlyph.x).toBeCloseTo(cart.x + 2 * CELL, 0)
      // The cart's cell is the same 44px as its neighbours.
      const cell = await box(h.locator('.mini-cart').filter({ visible: true }).locator('..'))
      expect(cell.width).toBe(CELL)
      expect(cell.height).toBe(CELL)

      // Live's handheld cart is the glyph and its count; the subtotal is
      // masthead-only, and the trigger still names it.
      const trigger = cartTrigger(page)
      await expect(trigger.locator('span.tabular-nums')).toBeHidden()
      await expect(trigger).toHaveAttribute('aria-label', /עגלת קניות, \d+ פריטים, /)
    })

    test('the badge is live’s 20px dark counter at the glyph’s bottom-left', async ({ page }) => {
      await withMirroredCart(page, 3)
      await page.goto('/')
      const badge = cartTrigger(page).locator('.header-badge')
      await expect(badge).toHaveText('3')
      const b = await box(badge)
      expect(b.width).toBe(20)
      expect(b.height).toBe(20)
      const style = await badge.evaluate((el) => {
        const s = getComputedStyle(el)
        return { font: s.fontSize, weight: s.fontWeight, bg: s.backgroundColor, color: s.color }
      })
      expect(style).toEqual({
        font: '10px',
        weight: '700',
        bg: 'rgb(51, 62, 72)',
        color: 'rgb(255, 255, 255)',
      })
      // `top:9px; right:9px` of the 22px glyph: it hangs off the bottom and
      // covers the glyph's left side.
      const glyph = await box(cartGlyph(page))
      expect(b.y).toBeCloseTo(glyph.y + 9, 0)
      expect(b.x + b.width).toBeCloseTo(glyph.x + GLYPH - 9, 0)
    })

    test('the handheld search row lightens its border on focus', async ({ page }) => {
      await page.goto('/')
      await header(page).getByRole('button', { name: 'חיפוש מוצרים' }).click()
      const input = page.locator('#handheld-search')
      await expect(input).toBeFocused()
      const pill = input.locator('..')
      await expect(pill).toHaveCSS('border-top-color', 'rgb(255, 235, 128)')
      await expect(input).toHaveCSS('outline-style', 'none')
    })
  })
}

test.describe('masthead at 1440px', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the logo is 300x79 and the subtotal is live’s 16px / 700 / heading', async ({ page }) => {
    await page.goto('/')
    const logo = await box(header(page).locator('img').first())
    expect(logo.width).toBeCloseTo(300, 0)
    expect(logo.height).toBe(79)

    const price = cartTrigger(page).locator('span.tabular-nums')
    await expect(price).toBeVisible()
    const style = await price.evaluate((el) => {
      const s = getComputedStyle(el)
      return { font: s.fontSize, weight: s.fontWeight, color: s.color }
    })
    expect(style).toEqual({ font: '16px', weight: '700', color: 'rgb(51, 62, 72)' })
    // Glyph and price share one row.
    const glyph = await box(cartGlyph(page))
    const priceBox = await box(price)
    expect(Math.abs(glyph.y + glyph.height / 2 - (priceBox.y + priceBox.height / 2))).toBeLessThan(
      2,
    )
  })

  test('the badge is live’s 21px yellow counter at the glyph’s bottom-left', async ({ page }) => {
    await withMirroredCart(page, 3)
    await page.goto('/')
    const badge = cartTrigger(page).locator('.header-badge')
    await expect(badge).toHaveText('3')
    const b = await box(badge)
    expect(b.width).toBe(21)
    expect(b.height).toBe(21)
    const style = await badge.evaluate((el) => {
      const s = getComputedStyle(el)
      return { font: s.fontSize, weight: s.fontWeight, bg: s.backgroundColor, color: s.color }
    })
    expect(style).toEqual({
      font: '12px',
      weight: '700',
      bg: 'rgb(254, 215, 0)',
      color: 'rgb(51, 62, 72)',
    })
    // `bottom:-3px; right:7px` of the glyph.
    const glyph = await box(cartGlyph(page))
    expect(b.y + b.height).toBeCloseTo(glyph.y + GLYPH + 3, 0)
    expect(b.x + b.width).toBeCloseTo(glyph.x + GLYPH - 7, 0)
    // No pop on arrival: the count came from the mirror, not from an action.
    await expect(badge).not.toHaveClass(/header-badge--bump/)
  })

  test('hovering an icon darkens it to live’s #29323a, no opacity fade', async ({ page }) => {
    await page.goto('/')
    const heart = header(page).getByRole('link', { name: 'המועדפים שלי' }).filter({ visible: true })
    expect(await heart.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(81, 81, 81)')
    await heart.hover()
    // Tailwind wraps `hover:` in `@media (hover: hover)`; a touch device keeps
    // the rest colour, asserted rather than skipped.
    const canHover = await page.evaluate(() => matchMedia('(hover: hover)').matches)
    await expect
      .poll(() => heart.evaluate((el) => getComputedStyle(el).color))
      .toBe(canHover ? 'rgb(41, 50, 58)' : 'rgb(81, 81, 81)')
    expect(await heart.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })

  test('the search pill lightens its border and carries the focus ring itself', async ({
    page,
  }) => {
    await page.goto('/')
    const input = page.locator('#masthead-search')
    const pill = input.locator('..')
    await expect(pill).toHaveCSS('border-top-color', 'rgb(254, 215, 0)')
    await expect(pill).toHaveCSS('outline-style', 'none')

    await input.click()
    await expect(input).toBeFocused()
    // Live's `input:focus{border-color:#ffeb80}`.
    await expect(pill).toHaveCSS('border-top-color', 'rgb(255, 235, 128)')
    // The site ring, on the pill and not clipped inside it.
    await expect(pill).toHaveCSS('outline-style', 'solid')
    await expect(pill).toHaveCSS('outline-width', '3px')
    await expect(pill).toHaveCSS('outline-color', 'rgb(254, 215, 0)')
    expect(await pill.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('6px')
    await expect(input).toHaveCSS('outline-style', 'none')
    await expect(input).toHaveCSS('box-shadow', 'none')

    // Tab to the submit button: it takes an inset ring, the pill gives up its own.
    await page.keyboard.press('Tab')
    const button = pill.getByRole('button', { name: 'חפש' })
    await expect(button).toBeFocused()
    expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('inset')
    await expect(pill).toHaveCSS('outline-style', 'none')
    // Still focused within, still live's lighter border.
    await expect(pill).toHaveCSS('border-top-color', 'rgb(255, 235, 128)')
  })
})
