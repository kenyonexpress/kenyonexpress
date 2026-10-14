// One add-to-cart at a width, screenshot while the toast is up (for the eye).
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3364'
const TAG = process.env.TAG ?? 'before'
const width = Number(process.env.WIDTH ?? 380)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'he-IL' })
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
await page.goto(`${BASE}/product/e2e-test-physical`, { waitUntil: 'networkidle' })
const btn = page.getByRole('button', { name: /הוסף לסל|קנה עכשיו/ }).first()
await btn.click()
await page.locator('[data-sonner-toast]').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
const info = await page.evaluate(() => {
  const h = document.querySelector('header')
  const t = document.querySelector('[data-sonner-toast]')
  return {
    headerPosition: h ? getComputedStyle(h).position : null,
    headerRect: h ? h.getBoundingClientRect().toJSON() : null,
    toastRect: t ? t.getBoundingClientRect().toJSON() : null,
    badge: document.querySelector('[data-cart-count]')?.getBoundingClientRect().toJSON() ?? null,
  }
})
console.log(JSON.stringify(info))
await page.screenshot({ path: `logs/ux28/${TAG}-${width}-toast-up.png` })
await browser.close()
