import { expect, test } from '@playwright/test'

/**
 * UX09 (14.10.2026): THE FEATURED DEALS GRID ("מוצרים מובילים") ON THE HOME
 * PAGE, read off the rendered page at the three measured widths.
 *
 *   380    one column, every item 548 tall (live's phone pitch)
 *   768    two columns, 501
 *   1440   four columns, 501
 *
 * and the height is a property of the GRID, not of the data: the section is
 * a CSS grid with `grid-auto-rows: 1fr`, and every card reserves its
 * department row (24px) and photograph slot (245px) whether or not the
 * product has them. The last test proves that by hollowing one card out in
 * the DOM the way the markup does for a product with no category and no
 * thumbnail, and measuring that it is still exactly as tall as its row.
 *
 * Structural assertions only, no screenshots; the pixel gate (compare.mjs)
 * scores this section against live separately.
 */

const WIDTHS = [
  { width: 380, columns: 1 },
  { width: 768, columns: 2 },
  { width: 1440, columns: 4 },
] as const

type Page = import('@playwright/test').Page

const section = (page: Page) => page.locator('section[aria-label="מוצרים מובילים"]')
const items = (page: Page) => section(page).locator('.jet-listing-grid-deals__item')

async function open(page: Page, width: number) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/')
  await section(page).scrollIntoViewIfNeeded()
  await expect(items(page)).toHaveCount(32)
}

type Layout = {
  display: string
  columns: number
  autoRows: string
  rows: number[]
  heights: number[]
  widths: number[]
}

function readLayout(page: Page): Promise<Layout> {
  return section(page)
    .locator('.jet-listing-grid-deals')
    .evaluate((grid) => {
      const s = getComputedStyle(grid)
      const boxes = [...grid.querySelectorAll(':scope > .jet-listing-grid-deals__item')].map((el) =>
        el.getBoundingClientRect(),
      )
      const rowYs: number[] = []
      const rows = boxes.map((b) => {
        const y = Math.round(b.y)
        let i = rowYs.findIndex((ry) => Math.abs(ry - y) < 2)
        if (i < 0) i = rowYs.push(y) - 1
        return i
      })
      return {
        display: s.display,
        columns: s.gridTemplateColumns.split(' ').length,
        autoRows: s.gridAutoRows,
        rows,
        heights: boxes.map((b) => Math.round(b.height * 10) / 10),
        widths: boxes.map((b) => Math.round(b.width * 10) / 10),
      }
    })
}

for (const { width, columns } of WIDTHS) {
  test.describe(`the deals grid at ${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await open(page, width)
    })

    test(`${columns} column${columns > 1 ? 's' : ''}, one height for every card`, async ({
      page,
    }) => {
      const layout = await readLayout(page)
      expect(layout.display).toBe('grid')
      expect(layout.columns).toBe(columns)
      // The row count follows from 32 cards over the column count, and every
      // row holds exactly `columns` cards: no wrap left a short row.
      const perRow = new Map<number, number>()
      for (const r of layout.rows) perRow.set(r, (perRow.get(r) ?? 0) + 1)
      expect(perRow.size).toBe(32 / columns)
      expect([...perRow.values()].every((n) => n === columns)).toBe(true)
      // One height, one width, across the whole grid and not per row.
      expect(new Set(layout.heights).size, `heights ${layout.heights.join(',')}`).toBe(1)
      expect(new Set(layout.widths).size, `widths ${layout.widths.join(',')}`).toBe(1)
      // Live's pitch: 548 on a phone, 501 from 768 (refs/ke_live_computed.json).
      expect(layout.heights[0]).toBe(width < 768 ? 548 : 501)
    })

    test('a card with no department and no photograph is as tall as its row', async ({ page }) => {
      const before = await readLayout(page)
      // Hollow the fifth card out the way the markup renders a product that
      // has neither: the category link becomes the empty hidden span, and the
      // <img> is removed so the wrap has nothing in flow to measure.
      await items(page)
        .nth(4)
        .evaluate((el) => {
          const cat = el.querySelector('.p_con__category')
          if (cat) {
            const span = document.createElement('span')
            span.className = 'p_con__category'
            span.setAttribute('aria-hidden', 'true')
            span.setAttribute('data-empty-slot', 'category')
            cat.replaceWith(span)
          }
          el.querySelector('.p_con__image')?.remove()
        })
      const after = await readLayout(page)
      expect(after.heights[4]).toBe(before.heights[4])
      expect(new Set(after.heights).size, `heights ${after.heights.join(',')}`).toBe(1)
      // The slots themselves held their measured heights.
      const slots = await items(page)
        .nth(4)
        .evaluate((el) => ({
          category: el.querySelector('.p_con__category')?.getBoundingClientRect().height ?? 0,
          image: el.querySelector('.p_con__image-wrap')?.getBoundingClientRect().height ?? 0,
        }))
      expect(slots.category).toBe(24)
      expect(slots.image).toBe(245)
    })
  })
}
