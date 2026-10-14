import { expect, test } from '@playwright/test'

/**
 * UX11 (14.10.2026): THE BRANDS ROW, read off the rendered page.
 * Before (logs/ux11/before.json): the home page had no brand surface at all;
 * the only place a merchant logo showed was the /merchants card, an 80x80
 * box in full colour. Now:
 *
 *   list     below 768 one scrolling row of 150px tiles (overflow-x auto,
 *            snap points, no scrollbar painted); from 768 a grid of three,
 *            from 1200 five, one row height
 *   tile     a link to /s/<id>, at least 44px tall, 12px corners, carrying
 *            either the merchant's logo (alt = name) or its name as a
 *            wordmark
 *   colour   where the device has a pointer, the logo is grayscale and dim
 *            at rest and full colour under hover and keyboard focus, and the
 *            wordmark is muted ink that turns heading ink; where it has none
 *            (the phone project), everything is in colour at rest
 *
 * Structural assertions, no screenshots. The section depends on the
 * catalogue (a merchant with a product on sale), so a catalogue with none
 * skips rather than fails, and the logo assertions skip when no merchant
 * has a logo (today: one, measured 14.10).
 */

const TOKENS = {
  heading: 'rgb(51, 62, 72)',
  muted: 'rgb(111, 111, 111)',
  cardRadius: '12px',
  tileWidth: 150,
} as const

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

const section = (page: Page) => page.locator('section[aria-labelledby="home-brands-title"]')
const list = (page: Page) => section(page).locator('[data-brands-list]')
const tiles = (page: Page) => list(page).locator('[data-brand-tile]')

test.describe('brands row (UX11)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
    test.skip((await section(page).count()) === 0, 'no merchant with a product on sale')
    await section(page).scrollIntoViewIfNeeded()
  })

  test('is a scroll strip on a phone and a 3 / 5 grid at 768 / 1440', async ({ page }) => {
    for (const [width, columns] of [
      [380, 0],
      [768, 3],
      [1440, 5],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await section(page).scrollIntoViewIfNeeded()
      const count = await tiles(page).count()
      const layout = await list(page).evaluate((el) => {
        const s = getComputedStyle(el)
        return {
          display: s.display,
          columns: s.gridTemplateColumns.split(' ').filter(Boolean).length,
          overflowX: s.overflowX,
          snap: s.scrollSnapType,
          scrollable: el.scrollWidth > el.clientWidth + 1,
        }
      })
      const boxes = await tiles(page).evaluateAll((els) =>
        els.map((el) => {
          const b = el.getBoundingClientRect()
          return { y: Math.round(b.y), w: b.width, h: b.height }
        }),
      )
      if (columns === 0) {
        expect(layout.display, `${width}: a flex strip`).toBe('flex')
        expect(layout.overflowX, `${width}: scrolls sideways`).toBe('auto')
        expect(layout.snap, `${width}: snaps`).toMatch(/^x/)
        for (const b of boxes) expect(b.w, `${width}: tile width`).toBe(TOKENS.tileWidth)
        expect(new Set(boxes.map((b) => b.y)).size, `${width}: one row`).toBe(1)
        if (count >= 3) expect(layout.scrollable, `${width}: ${count} tiles overflow`).toBe(true)
      } else {
        expect(layout.display, `${width}: a grid`).toBe('grid')
        expect(layout.columns, `${width}: columns`).toBe(columns)
        expect(layout.overflowX, `${width}: nothing clipped`).toBe('visible')
        const rows = [...new Set(boxes.map((b) => b.y))]
        expect(rows.length, `${width}: rows`).toBe(Math.ceil(count / columns))
        expect(new Set(boxes.map((b) => b.h)).size, `${width}: one tile height`).toBe(1)
      }
    }
  })

  test('every tile is one link to a merchant storefront, at least 44px tall, 12px corners', async ({
    page,
  }) => {
    const count = await tiles(page).count()
    expect(count).toBeGreaterThan(0)
    // home-rtl.spec's anchor list is pinned at twenty, so the row's direction
    // is asserted here rather than there.
    for (const el of [section(page), list(page)]) {
      expect(await el.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl')
    }
    for (let i = 0; i < count; i += 1) {
      const tile = tiles(page).nth(i)
      const links = tile.locator('a')
      await expect(links).toHaveCount(1)
      await expect(links.first()).toHaveAttribute('href', /^\/s\/[0-9a-f-]{36}$/)
      const box = await links.first().boundingBox()
      expect(box?.height ?? 0, `tile ${i} hit area`).toBeGreaterThanOrEqual(44)
      const radius = await links.first().evaluate((el) => getComputedStyle(el).borderRadius)
      expect(radius).toBe(TOKENS.cardRadius)
      const kind = await tile.getAttribute('data-brand-kind')
      if (kind === 'logo') {
        const img = tile.locator('img')
        await expect(img).toHaveCount(1)
        expect((await img.getAttribute('alt')) ?? '', `tile ${i} logo alt`).not.toBe('')
      } else {
        const word = tile.locator('[data-brand-wordmark]')
        await expect(word).toHaveCount(1)
        expect((await word.textContent())?.trim() ?? '', `tile ${i} wordmark`).not.toBe('')
      }
    }
  })

  test('a logo is grey at rest and in colour under hover, only where a pointer exists', async ({
    page,
  }) => {
    const logo = tiles(page)
      .filter({ has: page.locator('img') })
      .first()
    test.skip((await logo.count()) === 0, 'no merchant has a logo in this catalogue')
    const hoverCapable = await page.evaluate(() => matchMedia('(hover: hover)').matches)
    const img = logo.locator('img')
    const style = () =>
      img.evaluate((el) => {
        const s = getComputedStyle(el)
        return { filter: s.filter, opacity: s.opacity }
      })
    await page.mouse.move(0, 0)
    const rest = await style()
    if (!hoverCapable) {
      expect(rest.filter, 'a touch device never hovers, so no grey').toBe('none')
      expect(rest.opacity).toBe('1')
      return
    }
    expect(rest.filter).toBe('grayscale(1)')
    expect(Number(rest.opacity)).toBeLessThan(1)
    await logo.locator('a').hover()
    await expect.poll(async () => (await style()).filter).toBe('none')
    expect((await style()).opacity).toBe('1')
  })

  test('a wordmark is muted ink at rest and heading ink under hover and keyboard focus', async ({
    page,
  }) => {
    const word = tiles(page)
      .filter({ has: page.locator('[data-brand-wordmark]') })
      .first()
    test.skip((await word.count()) === 0, 'every merchant has a logo in this catalogue')
    const hoverCapable = await page.evaluate(() => matchMedia('(hover: hover)').matches)
    const link = word.locator('a')
    const colour = () => link.evaluate((el) => getComputedStyle(el).color)
    await page.mouse.move(0, 0)
    if (!hoverCapable) {
      expect(await colour(), 'a touch device reads the name in full ink').toBe(TOKENS.heading)
      return
    }
    expect(await colour()).toBe(TOKENS.muted)
    await link.hover()
    await expect.poll(colour).toBe(TOKENS.heading)
    await page.mouse.move(0, 0)
    await expect.poll(colour).toBe(TOKENS.muted)
    await link.focus()
    // :focus-visible after a programmatic focus follows the last input
    // modality; press Tab away and back so the browser treats it as keyboard.
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect.poll(colour).toBe(TOKENS.heading)
  })
})
