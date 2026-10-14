import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3364'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 380, height: 900 },
  locale: 'he-IL',
  hasTouch: true,
})
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
await page.goto(`${BASE}/login?next=%2Faccount`)
await page.getByLabel('אימייל', { exact: true }).fill('e2e-customer@test.kenyonexpress.local')
await page.getByLabel('סיסמה', { exact: true }).fill('E2eCustomer!pass1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
console.log('after login', page.url())
await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' })
console.log('account url', page.url())
console.log(
  await page.evaluate(() => ({
    navs: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label')),
    tabs: [
      ...(document.querrySelectorAll?.('.account-tabbar a') ??
        document.querySelectorAll('.account-tabbar a')),
    ].map((a) => a.textContent.trim()),
    h1: document.querySelector('h1')?.textContent,
  })),
)
await page.screenshot({ path: 'logs/ux27/debug-account-380.png' })
await browser.close()
