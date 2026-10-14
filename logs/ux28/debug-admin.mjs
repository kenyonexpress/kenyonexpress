import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3364'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
page.on('response', (r) => {
  if (r.request().method() === 'POST') console.log('POST', r.url(), r.status())
})
await page.goto(`${BASE}/login?next=%2Fadmin%2Fproducts`)
await page.getByLabel('אימייל', { exact: true }).fill('e2e-admin@test.kenyonexpress.local')
await page.getByLabel('סיסמה', { exact: true }).fill('E2eAdmin!pass1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForTimeout(12000)
console.log('url', page.url())
console.log(
  'alerts',
  await page.locator('[role="alert"], .text-red-600, [aria-invalid="true"]').allTextContents(),
)
console.log('body', (await page.locator('main').innerText()).slice(0, 400))
await page.screenshot({ path: 'logs/ux28/debug-admin-login.png' })
await browser.close()
