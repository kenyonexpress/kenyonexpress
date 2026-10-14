// UX16: two extra frames for the record, after the probe: the card at a count
// of two with the per-product disclosure open, and the row mid-exit.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3353'
const browser = await chromium.launch()
for (const width of [380, 1440]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'he-IL',
    hasTouch: width < 768,
    // A fresh client IP for the cart's 120/h write limiter (see
    // playwright.config.ts, E2E_FORWARDED_FOR).
    extraHTTPHeaders: { 'x-forwarded-for': process.env.FORWARDED_FOR ?? '10.16.0.2' },
  })
  await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/product/6253`, { waitUntil: 'networkidle' })
  await page.locator('.pdp-buy__atc').first().click()
  await page
    .getByText(/נוסף לעגלה/)
    .first()
    .waitFor({ timeout: 15000 })
  await page.waitForTimeout(300)
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
  await page.locator('.cart-line').first().waitFor()
  await page.locator('.cart-line').first().getByRole('button', { name: 'הוסף כמות' }).click()
  await page.getByTestId('cart-breakdown').waitFor()
  await page.getByTestId('cart-breakdown').locator('summary').click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `logs/ux16/after-qty2-${width}.png`, fullPage: true })
  await page.addStyleTag({
    content: '.cart-line[data-leaving]{animation-duration:4000ms !important}',
  })
  await page
    .locator('.cart-line')
    .first()
    .getByRole('button', { name: /^הסר .* מהעגלה$/ })
    .click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `logs/ux16/after-leaving-${width}.png` })
  await ctx.close()
}
await browser.close()
