import { expect, test } from '@playwright/test'

/**
 * UX04: THE OFF-CANVAS DRAWER (380 / 768) AND THE CATEGORY PANEL (1440), read
 * off the rendered page. `menu-drawer-polish-gate.test.ts` proves the classes
 * and tokens are in the source; this proves what the browser does with them,
 * which is where the defects lived (logs/ux04/before.json, 14.10.2026):
 *
 *   paper    the open panel's background-color was rgba(0,0,0,0); the class
 *            `bg-drawer` matched no token and the rows painted over the page
 *   motion   300ms on Tailwind's curve where live is `all .2s` (ease)
 *   scrim    50% black where live is rgba(0,0,0,.7); and not inert while
 *            closed, so a full-viewport button at opacity 0 hit-tested to the
 *            page under it (touch-targets.spec: "covered")
 *   toggle   #515151 with an opacity fade where live's `.light .navbar-toggler`
 *            is #333e48 and hovers to #000
 *   rows     15px inset / #333e48 / #ddd rules / #f5f5f5 hover, where live's
 *            `.off-canvas-navigation.light ul li a` is 19.4px / #4b566b /
 *            #e3e9ef / #ebebeb + #000
 *   panel    the hero sidebar's nav had no name; the sticky header was not
 *            scroll padding
 *
 * Structural assertions only, no screenshots, so there is no baseline to rot.
 */

const LIVE = {
  paper: 'rgb(253, 252, 252)',
  hairline: 'rgb(227, 233, 239)',
  rowText: 'rgb(75, 86, 107)',
  rowHover: 'rgb(235, 235, 235)',
  black: 'rgb(0, 0, 0)',
  heading: 'rgb(51, 62, 72)',
  panelTint: 'rgb(245, 245, 245)',
  rowPad: 19.4,
  rowHeight: 50,
  duration: '0.2s',
  ease: 'ease',
} as const

type Page = import('@playwright/test').Page

/**
 * Tailwind v4 gates every `hover:` utility behind `@media (hover: hover)`, so
 * on the Pixel 5 project a hover changes nothing, by design (UX03 measured
 * the same for the header icons). The rest colours and the geometry are
 * asserted on both projects; only the hover transitions are desktop-only.
 */
const hoverApplies = () => !test.info().project.use.hasTouch

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

function trigger(page: Page) {
  return page.getByRole('button', { name: 'תפריט קטגוריות' })
}

function dialog(page: Page) {
  return page.locator('[role="dialog"][aria-modal="true"]')
}

/** The scrim: the close button OUTSIDE the panel. */
function scrim(page: Page) {
  return page.locator('button[aria-label="סגירת התפריט"].fixed')
}

async function style(locator: import('@playwright/test').Locator, props: string[]) {
  return locator.evaluate((el, names) => {
    const s = getComputedStyle(el)
    return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n)]))
  }, props)
}

for (const [width, panelWidth] of [
  [380, 280],
  [768, 350],
] as const) {
  test.describe(`the drawer at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } })

    test.beforeEach(async ({ page }) => {
      await preset(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
    })

    test('the closed scrim is inert and out of the hit test', async ({ page }) => {
      const closed = scrim(page)
      await expect(closed).toHaveAttribute('inert', '')
      const hit = await closed.evaluate((el) => {
        const b = el.getBoundingClientRect()
        const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
        return at === el
      })
      expect(hit, 'the closed scrim must not be what the page hit-tests to').toBe(false)
    })

    test('the toggle is the heading colour and hovers to black', async ({ page }) => {
      const t = trigger(page)
      const rest = await style(t, ['color', 'transition-property'])
      expect(rest.color).toBe(LIVE.heading)
      expect(rest['transition-property']).toContain('color')
      if (!hoverApplies()) return
      await t.hover()
      await expect
        .poll(async () => (await style(t, ['color'])).color, { timeout: 2_000 })
        .toBe(LIVE.black)
      expect((await style(t, ['opacity'])).opacity).toBe('1')
    })

    test(`opens a ${panelWidth}px panel on live's paper, hairline and motion`, async ({ page }) => {
      await trigger(page).click()
      const panel = dialog(page)
      await expect(panel).toBeVisible()
      await expect.poll(async () => (await panel.boundingBox())?.x ?? -1).toBe(width - panelWidth)
      const box = await panel.boundingBox()
      expect(box?.width).toBe(panelWidth)

      const s = await style(panel, [
        'background-color',
        'border-left-width',
        'border-left-color',
        'border-right-width',
        'transition-duration',
        'transition-timing-function',
        'scrollbar-width',
      ])
      expect(s['background-color'], "the panel paints live's paper").toBe(LIVE.paper)
      // Anchored right, so the inner edge is the LEFT edge on screen.
      expect(s['border-left-width']).toBe('1px')
      expect(s['border-left-color']).toBe(LIVE.hairline)
      expect(s['border-right-width']).toBe('0px')
      expect(s['transition-duration']).toBe(LIVE.duration)
      expect(s['transition-timing-function']).toBe(LIVE.ease)
      expect(s['scrollbar-width']).toBe('thin')
    })

    test('the open scrim is 70% black over 200ms and is live in the hit test', async ({ page }) => {
      await trigger(page).click()
      const open = scrim(page)
      await expect(open).not.toHaveAttribute('inert', '')
      const s = await style(open, ['background-color', 'transition-duration', 'opacity'])
      // Tailwind v4 serialises `bg-black/70` through color-mix; whatever the
      // colour space, the alpha channel is the measurement.
      expect(s['background-color']).toMatch(/\/\s*0\.7\)$/)
      expect(s['transition-duration']).toBe(LIVE.duration)
      await expect.poll(async () => (await style(open, ['opacity'])).opacity).toBe('1')
    })

    test("the rows are live's: 50px, 19.4px inset, #4b566b on #e3e9ef, hover #ebebeb + black", async ({
      page,
    }) => {
      await trigger(page).click()
      const rows = dialog(page).locator('nav a')
      await expect(rows).toHaveCount(11)
      const first = rows.first()
      const box = await first.boundingBox()
      expect(box?.height).toBe(LIVE.rowHeight)
      const s = await style(first, [
        'padding-left',
        'padding-right',
        'color',
        'border-bottom-color',
        'border-bottom-width',
        'font-size',
      ])
      expect(Number.parseFloat(s['padding-left'] ?? '')).toBeCloseTo(LIVE.rowPad, 1)
      expect(Number.parseFloat(s['padding-right'] ?? '')).toBeCloseTo(LIVE.rowPad, 1)
      expect(s.color).toBe(LIVE.rowText)
      expect(s['border-bottom-color']).toBe(LIVE.hairline)
      expect(s['border-bottom-width']).toBe('1px')
      expect(s['font-size']).toBe('14px')

      // The highlight rows are bold and nothing else: the colour is live's
      // `!important` #4b566b on every row.
      const fourth = rows.nth(3)
      expect((await style(first, ['font-weight']))['font-weight']).toBe('700')
      expect((await style(fourth, ['font-weight']))['font-weight']).toBe('400')
      expect((await style(fourth, ['color'])).color).toBe(LIVE.rowText)

      if (!hoverApplies()) return
      await fourth.hover()
      await expect
        .poll(async () => (await style(fourth, ['background-color']))['background-color'])
        .toBe(LIVE.rowHover)
      expect((await style(fourth, ['color'])).color).toBe(LIVE.black)
    })

    test('the title row sits on the same hairline and the close button hovers to black', async ({
      page,
    }) => {
      await trigger(page).click()
      const closeButton = dialog(page).getByRole('button', { name: 'סגירת התפריט' })
      const row = closeButton.locator('..')
      const s = await style(row, ['border-bottom-color', 'border-bottom-width'])
      expect(s['border-bottom-color']).toBe(LIVE.hairline)
      expect(s['border-bottom-width']).toBe('1px')
      expect((await style(closeButton, ['color'])).color).toBe(LIVE.heading)
      const hit = await closeButton.boundingBox()
      // Sub-pixel: a flex row hands the cell 44.00003 at 768.
      expect(hit?.width).toBeCloseTo(44, 2)
      expect(hit?.height).toBeCloseTo(44, 2)
      if (!hoverApplies()) return
      await closeButton.hover()
      await expect.poll(async () => (await style(closeButton, ['color'])).color).toBe(LIVE.black)
    })
  })
}

test.describe('the category panel at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test("its nav is a named landmark distinct from the drawer's and the footer's", async ({
    page,
  }) => {
    const nav = page.locator('aside.departments-menu-v2 nav')
    await expect(nav).toHaveAttribute('aria-label', /\p{Script=Hebrew}/u)
    const names = await page
      .locator('nav[aria-label]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
    const sidebarName = await nav.getAttribute('aria-label')
    expect(names.filter((n) => n === sidebarName)).toHaveLength(1)
  })

  test("a row tints #f5f5f5 and goes bold under the pointer, as live's li:hover>a does", async ({
    page,
  }) => {
    const row = page.locator('aside.departments-menu-v2 ul a').nth(3)
    expect((await style(row, ['font-weight']))['font-weight']).toBe('400')
    if (!hoverApplies()) return
    await row.hover()
    await expect
      .poll(async () => (await style(row, ['background-color']))['background-color'])
      .toBe(LIVE.panelTint)
    expect((await style(row, ['font-weight']))['font-weight']).toBe('700')
  })

  test('a focused row scrolled under the sticky header is brought out from under it (2.4.11)', async ({
    page,
  }) => {
    const padding = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingTop,
    )
    expect(padding).toBe('110px')
    const last = page.locator('aside.departments-menu-v2 ul a').last()
    const result = await last.evaluate((el) => {
      // Park the row 30px from the top of the viewport, i.e. under the 110px
      // sticky header, then focus it: the browser scrolls a focused control
      // into view honouring scroll-padding, so it must land below the header.
      const top = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, top - 30)
      el.focus()
      const b = el.getBoundingClientRect()
      const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
      const header = document.querySelector('header')
      return {
        y: b.y,
        hitsSelf: at === el || el.contains(at),
        underHeader: header?.contains(at) ?? false,
      }
    })
    expect(result.y).toBeGreaterThanOrEqual(110)
    expect(result.hitsSelf).toBe(true)
    expect(result.underHeader).toBe(false)
  })
})
