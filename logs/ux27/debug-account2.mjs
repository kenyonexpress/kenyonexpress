import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3364'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
page.on('response', (r) => {
  if (r.url().includes('/account') || r.url().includes('/login'))
    console.log('resp', r.status(), r.url().slice(0, 90), r.headers().location ?? '')
})
await page.goto(`${BASE}/login?next=%2Faccount`)
await page.getByLabel('אימייל', { exact: true }).fill('e2e-customer@test.kenyonexpress.local')
await page.getByLabel('סיסמה', { exact: true }).fill('E2eCustomer!pass1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
console.log('after login', page.url())
await page.waitForLoadState('networkidle')
console.log('h1 after login', await page.evaluate(() => document.querySelector('h1')?.textContent))
const cookies = await ctx.cookies()
console.log(
  'cookies',
  cookies.map(
    (c) =>
      `${c.name} secure=${c.secure} http=${c.httpOnly} exp=${c.expires} path=${c.path} len=${c.value.length}`,
  ),
)
console.log('--- second goto')
await page.goto(`${BASE}/account/orders`, { waitUntil: 'networkidle' })
console.log(
  'url',
  page.url(),
  'h1',
  await page.evaluate(() => document.querySelector('h1')?.textContent),
)
await browser.close()
