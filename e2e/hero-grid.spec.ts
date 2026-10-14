import { expect, test } from '@playwright/test'

/**
 * UX06: THE HERO'S THREE COLUMNS AT 1440, read off the rendered page against
 * refs/ke_live_1440.png (logs/ux06/live-blocks.mjs, 14.10.2026):
 *
 *   row       x135..x1305 (1170), 613 tall
 *   right     the category panel, x1064..x1305 (241); its list 270 wide from
 *             x1035, hung over the slider's edge
 *   centre    the slider, x336..x1064 (728) x 370
 *   left      the promo column, x135..x336 (201), three blocks 197 / 198 / 198
 *             = 593, hairlines #e7e7e7 at the block seams, 20px white under
 *   blocks    16px inset; copy 17px / 23px / 200 with a 700 strong, right edge
 *             at the inset; the action row 14px / 30px / 700 right under it
 *             with an 18px disc to its left; a 110px picture rotated 16deg off
 *             the bottom-left corner, clipped by the block
 *
 * Before (logs/ux06/before.json): the column was 200 wide and 613 tall, the
 * slider 729 from x335, the copy 11px, the action row at the LEFT edge, the
 * picture 80px. Below lg the column is display:none, as live's is through
 * 1199, and that is asserted too so a breakpoint tidy cannot bring a seventh
 * column of hero into a 768 page.
 *
 * Structural assertions only, no screenshots, so there is no baseline to rot.
 */

const LIVE = {
  rowX: 135,
  rowW: 1170,
  rowH: 613,
  promoW: 201,
  promoH: 593,
  sliderX: 336,
  sliderW: 728,
  sliderH: 370,
  asideX: 1064,
  asideW: 241,
  listX: 1035,
  listW: 270,
  block: 197,
  inset: 16,
  hairline: 'rgb(231, 231, 231)',
  heading: 'rgb(51, 62, 72)',
  yellow: 'rgb(254, 215, 0)',
  ink: 'rgb(26, 26, 26)',
} as const

type Page = import('@playwright/test').Page
type Locator = import('@playwright/test').Locator

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

const section = (page: Page) => page.locator('section[aria-label="אזור ראשי"]')
const slider = (page: Page) => page.locator('[data-hero-slider]')

/**
 * The static hero and the Suspense fallback both carry data-hero-slider for a
 * moment (home.spec documents the race), so a bare waitFor is a strict-mode
 * violation under load. Wait for the one that stays.
 */
async function ready(page: Page) {
  await expect(slider(page)).toHaveCount(1)
}
const promo = (page: Page) => page.locator('[data-hero-promo]')
const blocks = (page: Page) => page.locator('[data-hero-promo-block]')

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error(`no box for ${String(locator)}`)
  return b
}

async function style(locator: Locator, props: string[]) {
  return locator.evaluate((el, names) => {
    const s = getComputedStyle(el)
    return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n)]))
  }, props)
}

const near = (actual: number, expected: number, tol = 0.5) =>
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol)

test.describe('the hero grid at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
    await ready(page)
  })

  test('three columns on one 1170 row: 201 | 728 | 241, edge to edge', async ({ page }) => {
    const row = await box(section(page))
    near(row.x, LIVE.rowX)
    near(row.width, LIVE.rowW)
    near(row.height, LIVE.rowH)

    const left = await box(promo(page))
    const centre = await box(slider(page))
    const right = await box(page.locator('aside.departments-menu-v2'))

    near(left.x, LIVE.rowX)
    near(left.width, LIVE.promoW)
    near(left.height, LIVE.promoH)
    near(left.y, row.y)

    near(centre.x, LIVE.sliderX)
    near(centre.width, LIVE.sliderW)
    near(centre.height, LIVE.sliderH)
    near(centre.y, row.y)
    // The seam: the slider begins where the promo column ends.
    near(centre.x, left.x + left.width)

    near(right.x, LIVE.asideX)
    near(right.width, LIVE.asideW)
    near(right.x, centre.x + centre.width)
    near(right.x + right.width, row.x + row.width)

    const list = await box(page.locator('aside.departments-menu-v2 ul'))
    near(list.x, LIVE.listX)
    near(list.width, LIVE.listW)
  })

  test('the promo column is three blocks of 197 with a hairline between, 20px of white under', async ({
    page,
  }) => {
    const all = blocks(page)
    await expect(all).toHaveCount(3)
    const b0 = await box(all.nth(0))
    const b1 = await box(all.nth(1))
    const b2 = await box(all.nth(2))
    near(b0.height, LIVE.block)
    near(b1.height, LIVE.block + 1)
    near(b2.height, LIVE.block + 1)
    near(b1.y, b0.y + b0.height)
    near(b2.y, b1.y + b1.height)
    const col = await box(promo(page))
    near(b2.y + b2.height, col.y + col.height)
    const row = await box(section(page))
    near(row.y + row.height - (col.y + col.height), LIVE.rowH - LIVE.promoH)

    for (const i of [1, 2]) {
      const s = await style(all.nth(i), ['border-top-width', 'border-top-color'])
      expect(s['border-top-width']).toBe('1px')
      expect(s['border-top-color']).toBe(LIVE.hairline)
    }
    expect((await style(all.nth(0), ['border-top-width']))['border-top-width']).toBe('0px')
    for (const i of [0, 1, 2]) {
      const s = await style(all.nth(i).locator('a'), [
        'padding-top',
        'padding-right',
        'overflow',
        'background-color',
      ])
      expect(s['padding-top']).toBe(`${LIVE.inset}px`)
      expect(s['padding-right']).toBe(`${LIVE.inset}px`)
      expect(s.overflow).toBe('hidden')
      expect(s['background-color']).toBe('rgb(255, 255, 255)')
    }
  })

  test("copy is 17px light with a bold strong, right-aligned at the inset, as live's .da-text", async ({
    page,
  }) => {
    for (const i of [0, 1, 2]) {
      const block = blocks(page).nth(i)
      const text = block.locator('.da-text')
      const s = await style(text, [
        'font-size',
        'line-height',
        'font-weight',
        'color',
        'text-transform',
      ])
      expect(s['font-size']).toBe('17px')
      expect(s['line-height']).toBe('23px')
      expect(s['font-weight']).toBe('200')
      expect(s.color).toBe(LIVE.heading)
      expect(s['text-transform']).toBe('none')
      const strong = await style(text.locator('strong').first(), ['font-size', 'font-weight'])
      expect(strong['font-size']).toBe('17px')
      expect(strong['font-weight']).toBe('700')

      // Right edge of the copy = block's right edge - the inset.
      const bb = await box(block)
      const tb = await box(text)
      near(tb.x + tb.width, bb.x + bb.width - LIVE.inset)
      // Vertically centred: copy + action straddle the block's middle.
      const ab = await box(block.locator('.da-action'))
      const group = { top: tb.y, bottom: ab.y + ab.height }
      near((group.top + group.bottom) / 2, bb.y + bb.height / 2, 1)
    }
  })

  test('the action row sits under the copy at 14px / 30px / 700 with an 18px disc to its left', async ({
    page,
  }) => {
    for (const i of [0, 1, 2]) {
      const block = blocks(page).nth(i)
      const action = block.locator('.da-action')
      const s = await style(action, ['font-size', 'line-height', 'font-weight', 'color'])
      expect(s['font-size']).toBe('14px')
      expect(s['line-height']).toBe('30px')
      expect(s['font-weight']).toBe('700')
      expect(s.color).toBe(LIVE.heading)
      await expect(action).toHaveText(/לרכישה/)

      const bb = await box(block)
      const ab = await box(action)
      const tb = await box(block.locator('.da-text'))
      // Starts at the inline start, flush with the copy; follows it directly.
      near(ab.x + ab.width, bb.x + bb.width - LIVE.inset)
      near(ab.y, tb.y + tb.height)
      near(ab.height, 30)

      const disc = action.locator('span[aria-hidden="true"]')
      const db = await box(disc)
      near(db.width, 18)
      near(db.height, 18)
      const ds = await style(disc, ['background-color', 'border-radius', 'color'])
      expect(ds['background-color']).toBe(LIVE.yellow)
      // Dark ink on the yellow (brand-contrast gate), not live's white.
      expect(ds.color).toBe(LIVE.ink)
      // The disc is the LEFT end of the row; the text is to its right, 8px off.
      near(db.x, ab.x)
      const textRight = await action.evaluate((el) => {
        const range = document.createRange()
        range.selectNodeContents(el.firstChild as Node)
        return range.getBoundingClientRect().left
      })
      near(textRight - (db.x + db.width), 8, 1)
    }
  })

  test('each block hangs a 110px picture 16deg off its bottom-left corner, clipped and behind the copy', async ({
    page,
  }) => {
    for (const i of [0, 1, 2]) {
      const block = blocks(page).nth(i)
      const slot = block.locator('.da-media-left')
      const s = await style(slot, [
        'width',
        'height',
        'bottom',
        'left',
        'transform',
        'z-index',
        'position',
      ])
      expect(s.width).toBe('110px')
      expect(s.height).toBe('110px')
      expect(s.bottom).toBe('-30px')
      // inset-inline-end in a dir=rtl column resolves to the physical left.
      expect(s.left).toBe('-10px')
      expect(s.position).toBe('absolute')
      const transform = s.transform ?? 'none'
      expect(transform).not.toBe('none')
      const [a = 1, b = 0] = transform
        .replace(/^matrix\(|\)$/g, '')
        .split(',')
        .map(Number)
      near(Math.round((Math.atan2(b, a) * 180) / Math.PI), 16, 0)
      const bodyZ = await style(block.locator('.da-media-body'), ['z-index'])
      expect(Number(bodyZ['z-index'])).toBeGreaterThan(Number(s['z-index']) || 0)
      await expect(slot.locator('[data-awaiting-photography]')).toHaveCount(1)
    }
  })

  test('the promo links are the only links in the column and each names a category in Hebrew', async ({
    page,
  }) => {
    const links = promo(page).locator('a')
    await expect(links).toHaveCount(3)
    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
    expect(hrefs).toEqual([
      '/category/hot-deals',
      '/category/vacation',
      '/category/restaurants-cafes',
    ])
    for (const i of [0, 1, 2]) await expect(links.nth(i)).toHaveText(/\p{Script=Hebrew}/u)
  })
})

for (const width of [380, 768]) {
  test.describe(`the promo column at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('is not displayed, and the hero row does not overflow the viewport', async ({ page }) => {
      await preset(page)
      await page.goto('/')
      await ready(page)
      await expect(promo(page)).toBeHidden()
      expect((await style(promo(page), ['display'])).display).toBe('none')
      const row = await box(section(page))
      expect(row.x).toBeGreaterThanOrEqual(0)
      expect(row.x + row.width).toBeLessThanOrEqual(width)
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scrollW).toBeLessThanOrEqual(width)
    })
  })
}
