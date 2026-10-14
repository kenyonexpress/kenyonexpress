import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3352'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 380, height: 900 },
  hasTouch: true,
  locale: 'he-IL',
})
await ctx.addInitScript(() => {
  document.cookie = 'ke_consent=denied; path=/'
})
const page = await ctx.newPage()
page.on('response', (r) => {
  if (r.request().method() === 'POST') console.log('POST', r.status(), r.url().slice(0, 80))
})
await page.goto(`${BASE}/product/6253`, { waitUntil: 'networkidle' })
console.log('title', await page.title())
const atc = page.locator('.pdp-buy__atc').first()
console.log(
  'atc count',
  await atc.count(),
  'enabled',
  await atc.isEnabled().catch(() => 'n/a'),
  'text',
  (await atc.textContent().catch(() => ''))?.trim(),
)
await atc.click().catch((e) => console.log('click failed', e.message.split('\n')[0]))
await page.waitForTimeout(4000)
console.log(
  'badge',
  await page
    .locator('button[aria-label^="עגלת קניות, "]')
    .first()
    .getAttribute('aria-label')
    .catch(() => null),
)
console.log('toasts', await page.locator('[data-sonner-toast], [role="status"]').allTextContents())
await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
console.log(
  'cart lines',
  await page.locator('.cart-line').count(),
  'empty',
  await page.locator('.cart-empty').count(),
)
console.log(
  'cart text',
  (await page.locator('.cart-page').textContent())?.replace(/\s+/g, ' ').slice(0, 300),
)
await browser.close()
