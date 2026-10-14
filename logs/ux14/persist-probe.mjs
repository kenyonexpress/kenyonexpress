// UX14: does the list choice survive a reload on the built page? Reads the
// storage key and the pressed state before and after, and every console error.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3350'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await ctx.addInitScript(() => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
})
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 300))
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' })
const list = page.getByRole('button', { name: 'תצוגת רשימה' })
await list.click()
await page.waitForTimeout(300)
const afterClick = await page.evaluate(() => ({
  stored: localStorage.getItem('ke_catalog_view_v1'),
  pressed: document.querySelector('[data-view="list"][aria-pressed]')?.getAttribute('aria-pressed'),
  body: document.querySelector('.category-page__body')?.getAttribute('data-view'),
}))
await page.reload({ waitUntil: 'networkidle' })
const samples = []
for (let i = 0; i < 8; i++) {
  samples.push(
    await page.evaluate(() => ({
      t: Math.round(performance.now()),
      stored: localStorage.getItem('ke_catalog_view_v1'),
      pressed: document
        .querySelector('[data-view="list"][aria-pressed]')
        ?.getAttribute('aria-pressed'),
      body: document.querySelector('.category-page__body')?.getAttribute('data-view'),
      rows: document.querySelectorAll('.category-card--list').length,
    })),
  )
  await page.waitForTimeout(500)
}
console.log(JSON.stringify({ afterClick, samples, errors }, null, 2))
await browser.close()
