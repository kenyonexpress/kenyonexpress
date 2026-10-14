// Puts the E2E customer back the way the probes found it: the three fixture
// products stay saved, every other product the overlay hearts added by
// accident is removed from the wishlist, and the cart is emptied. One login.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3361'
const KEEP = /בדיקות אוטומטיות|מאלדיבים/
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'he-IL',
  extraHTTPHeaders: { 'x-forwarded-for': '10.20.11.5' },
})
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
await page.goto(`${BASE}/login?next=%2Faccount`, { waitUntil: 'networkidle' })
await page.getByLabel('אימייל').fill('e2e-customer@test.kenyonexpress.local')
await page.getByLabel('סיסמה').fill('E2eCustomer!pass1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
await page.goto(`${BASE}/account/wishlist`, { waitUntil: 'load' })
await page.locator('ul.wishlist-grid li, .wishlist-empty').first().waitFor({ timeout: 15000 })
for (;;) {
  const _stray = page
    .locator('ul.wishlist-grid li button[aria-label^="הסרת"]')
    .filter({ hasNot: page.locator(`[aria-label*="${'בדיקות אוטומטיות'}"]`) })
  const labels = await page
    .locator('ul.wishlist-grid li button[aria-label^="הסרת"]')
    .evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))
  const target = labels.find((l) => !KEEP.test(l))
  if (!target) break
  await page.getByRole('button', { name: target }).click()
  await page
    .locator(`button[aria-label="${target}"]`)
    .waitFor({ state: 'detached', timeout: 10000 })
  await page.waitForTimeout(400)
  console.log('removed', target)
}
console.log(
  'wishlist left',
  await page
    .locator('ul.wishlist-grid li')
    .evaluateAll((ls) => ls.map((l) => l.querySelector('.wishlist-card__title')?.textContent)),
)
await page.goto(`${BASE}/cart`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
for (let i = 0; i < 12; i++) {
  const remove = page.locator('.cart-line button', { hasText: /^הסר$|הסרה/ }).first()
  if (!(await remove.count())) break
  await remove.click()
  await page.waitForTimeout(1200)
}
console.log('cart lines left', await page.locator('.cart-line').count())
await browser.close()
