// UX22: when, if ever, does the first thumbnail node leave the DOM after it
// first appears, and what else is replaced with it? Desktop viewport, the
// one the neighbour spec fails on.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3363'
const URL_ = process.env.URL_ ?? '/products'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'he-IL' })
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
await page.addInitScript(() => {
  window.__timeline = []
  const t0 = performance.now()
  const tick = () => {
    const img = document.querySelector('.category-card__thumb img')
    const ul = document.querySelector('ul.category-products')
    if (img && !window.__img) {
      window.__img = img
      window.__ul = ul
      window.__li = img.closest('li')
    }
    window.__timeline.push({
      t: Math.round(performance.now() - t0),
      imgs: document.querySelectorAll('.category-card__thumb img').length,
      firstConnected: window.__img ? window.__img.isConnected : null,
      ulConnected: window.__ul ? window.__ul.isConnected : null,
      liConnected: window.__li ? window.__li.isConnected : null,
      ulBusy: ul?.getAttribute('aria-busy') ?? null,
    })
  }
  setInterval(tick, 50)
})
await page.goto(`${BASE}${URL_}`, { waitUntil: 'load' })
await page.waitForTimeout(6000)
const timeline = await page.evaluate(() => window.__timeline)
// Compress: print only rows where something changed.
let prev = null
for (const row of timeline) {
  const key = JSON.stringify({ ...row, t: 0 })
  if (key !== prev) console.log(JSON.stringify(row))
  prev = key
}
await browser.close()
