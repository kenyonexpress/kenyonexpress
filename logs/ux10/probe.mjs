import { writeFileSync } from 'node:fs'
// UX10 probe: the "קופונים חמים" section (HotCoupons) at 380 / 768 / 1440.
// Reads the grid's columns, every card's rect and inner slots (image band,
// badge, business line, title, location, price row, code button, countdown),
// plus the computed radius, border and font of the parts a coupon card is
// judged on, so a before/after can be read as numbers.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
const SEL = 'section[aria-labelledby="hot-coupons-title"]'
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
  await page.waitForTimeout(1200)
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
    const font = (el) => {
      if (!el) return null
      const s = getComputedStyle(el)
      return {
        size: s.fontSize,
        weight: s.fontWeight,
        color: s.color,
        bg: s.backgroundColor,
        radius: s.borderRadius,
        border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      }
    }
    const section = document.querySelector(SEL)
    const h2 = section.querySelector('h2')
    const more = section.querySelector('a[href="/coupons"]')
    const grid =
      section.querySelector('[data-hot-coupons-grid], h2 ~ div, .hot-coupons__grid') ??
      section.querySelector('div.grid')
    const gs = getComputedStyle(grid)
    const cards = [...grid.children].map((card, i) => {
      const q = (s) => card.querySelector(s)
      return {
        i,
        tag: card.tagName.toLowerCase(),
        rect: r(card),
        style: font(card),
        imageBand: r(q('.relative.h-32, [data-coupon-image]')),
        badge: {
          rect: r(q('.absolute, [data-coupon-badge]')),
          style: font(q('.absolute, [data-coupon-badge]')),
          text: q('.absolute, [data-coupon-badge]')?.textContent?.trim() ?? null,
        },
        stub: { rect: r(q('[data-coupon-stub]')), style: font(q('[data-coupon-stub]')) },
        business: {
          rect: r(q('p.text-xs, [data-coupon-business]')),
          text: q('p.text-xs, [data-coupon-business]')?.textContent?.trim() ?? null,
        },
        title: {
          rect: r(q('p.text-sm.font-semibold, [data-coupon-title]')),
          style: font(q('p.text-sm.font-semibold, [data-coupon-title]')),
        },
        price: {
          rect: r(q('.text-price, [data-coupon-price]')),
          style: font(q('.text-price, [data-coupon-price]')),
          text: q('.text-price, [data-coupon-price]')?.textContent?.trim() ?? null,
        },
        code: {
          rect: r(q('[data-coupon-code]')),
          style: font(q('[data-coupon-code]')),
          text: q('[data-coupon-code]')?.textContent?.trim() ?? null,
        },
        copy: {
          rect: r(q('[data-copy-code]')),
          style: font(q('[data-copy-code]')),
          text: q('[data-copy-code]')?.textContent?.trim() ?? null,
        },
        countdown: {
          rect: r(q('[data-coupon-countdown]')),
          style: font(q('[data-coupon-countdown]')),
          text: q('[data-coupon-countdown]')?.textContent?.trim() ?? null,
        },
        cta: {
          rect: r(q('a[href^="/coupons/"]')),
          text: q('a[href^="/coupons/"]')?.textContent?.trim() ?? null,
        },
        links: card.querySelectorAll('a').length,
        buttons: card.querySelectorAll('button').length,
      }
    })
    const rows = []
    for (const c of cards) {
      const y = Math.round(c.rect.y)
      let row = rows.find((rw) => Math.abs(rw.y - y) < 2)
      if (!row) {
        row = { y, items: [] }
        rows.push(row)
      }
      row.items.push(c.i)
    }
    const distinct = (a) => [...new Set(a.map((v) => +v.toFixed(1)))].sort((p, q) => p - q)
    return {
      present: true,
      section: r(section),
      heading: { rect: r(h2), style: font(h2), text: h2.textContent.trim() },
      more: { rect: r(more), text: more?.textContent?.trim() ?? null },
      grid: { rect: r(grid), display: gs.display, columns: gs.gridTemplateColumns, gap: gs.gap },
      count: cards.length,
      columnsPerRow: rows.map((rw) => rw.items.length),
      cardHeights: distinct(cards.map((c) => c.rect.h)),
      cardWidths: distinct(cards.map((c) => c.rect.w)),
      cards,
    }
  }, SEL)
  await section.screenshot({ path: `logs/ux10/${TAG}-${width}.png` })
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux10/${TAG}.json`, JSON.stringify(out, null, 2))
for (const [w, v] of Object.entries(out)) {
  if (!v.present) {
    console.log(w, 'absent')
    continue
  }
  console.log(
    w,
    'cols',
    v.grid.columns,
    'rows',
    v.columnsPerRow.join('/'),
    'cardH',
    v.cardHeights.join('/'),
    'cardW',
    v.cardWidths.join('/'),
    'radius',
    v.cards[0].style.radius,
    'badge',
    JSON.stringify(v.cards[0].badge),
    'price',
    v.cards[0].price.text,
    'links',
    v.cards[0].links,
  )
}
