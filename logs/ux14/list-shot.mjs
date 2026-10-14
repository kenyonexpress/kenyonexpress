// UX14: the list view as painted, at 768 and 1440, for the log.
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3350'
const browser = await chromium.launch()
const out = {}
for (const width of [768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'he-IL' })
  await ctx.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
    localStorage.setItem('ke_catalog_view_v1', 'list')
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.category-card--list')
  await page.waitForTimeout(400)
  out[width] = await page.evaluate(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect()
      return {
        x: +b.x.toFixed(1),
        y: +b.y.toFixed(1),
        w: +b.width.toFixed(1),
        h: +b.height.toFixed(1),
      }
    }
    const rows = [...document.querySelectorAll('.category-card--list')].slice(0, 3)
    return rows.map((r) => ({
      row: rect(r),
      media: rect(r.querySelector('.category-card__media')),
      body: rect(r.querySelector('.category-card__body')),
      footer: rect(r.querySelector('.category-card__footer--list')),
      desc: r.querySelector('.category-card__desc')?.textContent.slice(0, 40) ?? null,
      button: r.querySelector('.category-card__atc-full')
        ? rect(r.querySelector('.category-card__atc-full'))
        : null,
      columns: getComputedStyle(r).gridTemplateColumns,
      borderBottom: getComputedStyle(r).borderBottomWidth,
    }))
  })
  await page.locator('.category-control-bar').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `logs/ux14/after-list-${width}.png`, fullPage: false })
  await ctx.close()
}
await browser.close()
writeFileSync('logs/ux14/after-list.json', `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
