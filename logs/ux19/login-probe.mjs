import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.19.77.5' } })
const page = await ctx.newPage()
await page.goto('http://localhost:3359/login?next=%2Faccount%2Forders', {
  waitUntil: 'networkidle',
})
await page.getByLabel('אימייל').fill('e2e-customer@test.kenyonexpress.local')
await page.getByLabel('סיסמה').fill('E2eCustomer!pass1')
await page.getByRole('button', { name: 'כניסה', exact: true }).click()
await page.waitForTimeout(8000)
console.log('url', page.url())
console.log('alerts', await page.locator('[role=alert], [role=status]').allTextContents())
await browser.close()
