// Renders key pages at 380, 390 and 430, records horizontal overflow and saves a
// screenshot per page and width under docs/mobile-audit/. Read-only.
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(homedir(), 'Library/Caches/ms-playwright')
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3311'
const PRODUCT = encodeURI('מוצר-לדוגמא')
const PAGES = [
  ['home', '/'],
  ['products', '/products'],
  ['category', '/category/hot-deals'],
  ['product', `/product/${PRODUCT}`],
  ['cart', '/cart'],
  ['checkout', '/checkout'],
  ['cities', '/c'],
  ['city-tel-aviv', '/c/tel-aviv'],
  ['suppliers', '/suppliers'],
  ['login', '/login'],
  ['signup', '/signup'],
  ['terms', '/terms-and-conditions'],
  ['privacy', '/privacy-policy'],
  ['accessibility', '/accessibility'],
]
const WIDTHS = [380, 390, 430]
mkdirSync('docs/mobile-audit', { recursive: true })
const b = await chromium.launch()
const rows = []
for (const width of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 })
  for (const [name, path] of PAGES) {
    const page = await ctx.newPage()
    let status = 0
    try {
      const res = await page.goto(BASE + path, {
        waitUntil: name === 'checkout' ? 'load' : 'networkidle',
        timeout: 30000,
      })
      status = res?.status() ?? 0
    } catch {
      status = -1
    }
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => {
      const de = document.documentElement
      const tooSmall = [
        ...document.querySelectorAll('a,button,input,select,textarea,[role=button]'),
      ].filter((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== 'hidden' &&
          (r.height < 24 || r.width < 24)
        )
      }).length
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, tooSmall }
    })
    await page.screenshot({ path: `docs/mobile-audit/${name}-${width}.png`, fullPage: false })
    rows.push({ name, path, width, status, overflow: m.scrollW - m.clientW, tooSmall: m.tooSmall })
    await page.close()
  }
  await ctx.close()
}
await b.close()
writeFileSync('docs/mobile-audit/results.json', JSON.stringify(rows, null, 2))
const bad = rows.filter((r) => r.status !== 200 || r.overflow > 1)
console.log(`${rows.length} measurements, ${bad.length} with a non-200 or horizontal overflow`)
for (const r of bad) console.log(r)
