import { writeFileSync } from 'node:fs'
// UX09 probe: the "מוצרים מובילים" deals grid (DealsOfTheDay) at 380 / 768 /
// 1024 / 1199 / 1440. Reads the grid's display, every item's rect, the
// columns per row, the row pitch, the card heights (distinct values and
// spread), and per card the height of each slot (category, title wrap,
// image wrap, footer) so an uneven card can be traced to the slot that moved.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1024,1199,1440').split(',').map(Number)
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
const SEL = 'section[aria-label="מוצרים מובילים"]'
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const section = page.locator(SEL)
  if ((await section.count()) === 0) {
    out[width] = { present: false }
    await ctx.close()
    continue
  }
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  out[width] = await page.evaluate((SEL) => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        x: +b.x.toFixed(2),
        y: +b.y.toFixed(2),
        w: +b.width.toFixed(2),
        h: +b.height.toFixed(2),
      }
    }
    const section = document.querySelector(SEL)
    const grid = section.querySelector('.jet-listing-grid-deals')
    const gs = getComputedStyle(grid)
    const items = [...grid.querySelectorAll(':scope > .jet-listing-grid-deals__item')]
    const cards = items.map((it, i) => {
      const card = it.querySelector('.p_con')
      const cs = getComputedStyle(card)
      return {
        i,
        item: r(it),
        card: r(card),
        cardHeight: cs.height,
        minHeight: cs.minHeight,
        category: r(card.querySelector('.p_con__category')),
        titleWrap: r(card.querySelector('.p_con__title-wrap')),
        title: r(card.querySelector('.p_con__title')),
        imageWrap: r(card.querySelector('.p_con__image-wrap')),
        img: r(card.querySelector('.p_con__image')),
        footer: r(card.querySelector('.p_con__footer')),
        borderInlineEnd: cs.borderInlineEndWidth,
      }
    })
    const rows = []
    for (const c of cards) {
      const y = Math.round(c.item.y)
      let row = rows.find((rw) => Math.abs(rw.y - y) < 2)
      if (!row) {
        row = { y, items: [], heights: [] }
        rows.push(row)
      }
      row.items.push(c.i)
      row.heights.push(c.item.h)
    }
    const itemHeights = cards.map((c) => c.item.h)
    const cardHeights = cards.map((c) => c.card.h)
    const distinct = (a) => [...new Set(a.map((v) => +v.toFixed(1)))].sort((p, q) => p - q)
    const pitches = rows.slice(1).map((rw, i) => rw.y - rows[i].y)
    return {
      present: true,
      section: r(section),
      grid: {
        rect: r(grid),
        display: gs.display,
        flexWrap: gs.flexWrap,
        gridTemplateColumns: gs.gridTemplateColumns,
        gridAutoRows: gs.gridAutoRows,
        alignItems: gs.alignItems,
      },
      count: cards.length,
      columnsPerRow: rows.map((rw) => rw.items.length),
      rowCount: rows.length,
      rowPitches: distinct(pitches),
      itemHeights: {
        distinct: distinct(itemHeights),
        min: Math.min(...itemHeights),
        max: Math.max(...itemHeights),
      },
      cardHeights: {
        distinct: distinct(cardHeights),
        min: Math.min(...cardHeights),
        max: Math.max(...cardHeights),
      },
      itemWidths: distinct(cards.map((c) => c.item.w)),
      slots: {
        category: distinct(cards.map((c) => c.category?.h ?? 0)),
        titleWrap: distinct(cards.map((c) => c.titleWrap?.h ?? 0)),
        imageWrap: distinct(cards.map((c) => c.imageWrap?.h ?? 0)),
        img: distinct(cards.map((c) => c.img?.h ?? 0)),
        footer: distinct(cards.map((c) => c.footer?.h ?? 0)),
      },
      cards: cards.map((c) => ({
        i: c.i,
        item: c.item,
        card: c.card,
        cat: c.category?.h ?? 0,
        tw: c.titleWrap?.h ?? 0,
        iw: c.imageWrap?.h ?? 0,
        img: c.img?.h ?? 0,
        ft: c.footer?.h ?? 0,
        bie: c.borderInlineEnd,
      })),
    }
  }, SEL)
  await page.screenshot({ path: `logs/ux09/${TAG}-${width}.png`, fullPage: false })
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux09/${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`)
for (const [w, v] of Object.entries(out)) {
  if (!v.present) {
    console.log(w, 'absent')
    continue
  }
  console.log(
    w,
    'display',
    v.grid.display,
    'cols/row',
    JSON.stringify(v.columnsPerRow),
    'pitches',
    JSON.stringify(v.rowPitches),
    'itemH',
    JSON.stringify(v.itemHeights),
    'cardH',
    JSON.stringify(v.cardHeights),
    'slots',
    JSON.stringify(v.slots),
    'widths',
    JSON.stringify(v.itemWidths),
  )
}
