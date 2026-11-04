#!/usr/bin/env node
/**
 * V02 proof: /checkout at 380, 768 and 1440, written to docs/V02/, in four
 * states: the filled-cart page as it opens, the refused press (errors), the
 * busy press (loading) and the Suspense shell (skeleton). Also measures, per
 * shot, horizontal overflow and every visible control under the 44px touch
 * floor, and prints them as JSON so the doc can quote the run.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 node scripts/v02-checkout-shots.mjs
 *
 * NOTHING IS PAID AND NO ORDER IS CREATED. The busy state is shot with every
 * POST to /checkout held by the browser and then aborted, so the server action
 * never reaches the server. The guest cart this fills is a real row in
 * whatever database the server points at; it is a guest cart and the reaper
 * clears it.
 *
 * Browse localhost, not 127.0.0.1: server actions reject a mismatched origin.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const OUT = path.join(process.cwd(), 'docs', 'V02')
const WIDTHS = [380, 768, 1440]
const BUY = /הוסף לסל|קנה עכשיו/

mkdirSync(OUT, { recursive: true })

async function measure(page) {
  return page.evaluate(() => {
    const small = []
    const roots = [
      document.querySelector('.checkout-page'),
      document.querySelector('.checkout-sticky-pay'),
    ].filter(Boolean)
    for (const root of roots) {
      for (const el of root.querySelectorAll('button, a[href], input, textarea')) {
        if (el.type === 'hidden') continue
        // A tickbox is hit through its label, so the label is the target.
        const target =
          (el.type === 'checkbox' || el.type === 'radio') && el.closest('label')
            ? el.closest('label')
            : el
        const r = target.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (getComputedStyle(el).visibility === 'hidden') continue
        if (el.closest('[aria-hidden="true"]')) continue
        if (r.width < 44 || r.height < 44) {
          small.push({
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute('aria-label') ?? el.name ?? el.textContent ?? '')
              .trim()
              .slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
          })
        }
      }
    }
    const bar = document.querySelector('.checkout-sticky-pay')
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      stickyBar: bar ? getComputedStyle(bar).display !== 'none' : false,
      under44: small,
    }
  })
}

const browser = await chromium.launch({ channel: 'chromium' })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'he-IL',
})
const { hostname } = new URL(BASE)
await context.addCookies([{ name: 'ke_consent', value: 'denied.3', domain: hostname, path: '/' }])
const page = await context.newPage()
const report = {}

// 1. One product in the cart, from the catalogue.
await page.goto(`${BASE}/products`, { waitUntil: 'domcontentloaded' })
await page.locator('a[href^="/product/"]').first().waitFor({ timeout: 30_000 })
const hrefs = [
  ...new Set(
    await page
      .locator('a[href^="/product/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href'))),
  ),
]
let added = 0
for (const href of hrefs.slice(0, 10)) {
  if (added >= 1) break
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  const buy = page.locator('[data-pdp="summary"]').getByRole('button', { name: BUY }).first()
  if (!(await buy.isEnabled({ timeout: 5_000 }).catch(() => false))) continue
  await page.waitForLoadState('networkidle').catch(() => undefined)
  // The server action's answer, not the badge: navigating on the optimistic
  // badge cancels the add in flight (V01).
  const answered = page.waitForResponse((r) => r.request().method() === 'POST', {
    timeout: 30_000,
  })
  await buy.click()
  if (await answered.then((r) => r.ok()).catch(() => false)) added += 1
}
report.added = added

async function openCheckout(width) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await page.locator('.checkout-pay-btn').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(300)
}

// 2. As it opens: full page, and the first screen (where the sticky bar shows).
for (const w of WIDTHS) {
  await openCheckout(w)
  await page.screenshot({ path: path.join(OUT, `checkout-${w}.png`), fullPage: true })
  await page.screenshot({ path: path.join(OUT, `checkout-fold-${w}.png`), fullPage: false })
  report[`checkout-${w}`] = await measure(page)
}

// 3. The refused press, from the control a shopper at that width has under
//    the thumb: the sticky bar below 992, the panel's button above it.
for (const w of WIDTHS) {
  await openCheckout(w)
  const press =
    w < 992
      ? page.locator('.checkout-sticky-pay__btn')
      : page.getByRole('button', { name: 'שליחת הזמנה', exact: true })
  await press.click()
  await page.locator('[data-testid="checkout-error-summary"]').waitFor({ timeout: 5_000 })
  await page.waitForTimeout(300)
  report[`errors-${w}-focused`] = await page.evaluate(() => document.activeElement?.id ?? null)
  await page.screenshot({ path: path.join(OUT, `errors-${w}.png`), fullPage: false })
  report[`errors-${w}`] = await measure(page)
}

// 4. The busy press. Every POST to /checkout is held, then aborted: the
//    action never reaches the server, so nothing is created or charged.
await page.route(`${BASE}/checkout**`, async (route) => {
  if (route.request().method() !== 'POST') return route.continue()
  await new Promise((resolve) => setTimeout(resolve, 4_000))
  await route.abort()
})
for (const w of WIDTHS) {
  await openCheckout(w)
  await page.fill('#co-email', 'qa@example.com')
  await page.fill('#co-first-name', 'בדיקה')
  await page.fill('#co-last-name', 'חזותית')
  await page.fill('#co-phone', '0501234567')
  if (await page.locator('#co-city').isVisible()) {
    await page.fill('#co-city', 'תל אביב')
    await page.fill('#co-street', 'דיזנגוף')
    await page.fill('#co-number', '10')
  }
  await page.check('input[name="accept_terms"]')
  const pay = page.locator('.checkout-pay-btn')
  await pay.scrollIntoViewIfNeeded()
  await pay.click()
  await page.locator('.checkout-pay-btn[aria-busy="true"]').waitFor({ timeout: 3_000 })
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, `loading-${w}.png`), fullPage: false })
  report[`loading-${w}`] = await page.locator('.checkout-pay-btn').textContent()
  await page.waitForTimeout(4_200)
}
await page.unroute(`${BASE}/checkout**`)

// 5. The Suspense shell. With scripts off the streamed body never swaps in,
//    so what paints is the fallback the page shows while the cart is read.
const shell = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'he-IL',
  javaScriptEnabled: false,
  storageState: await context.storageState(),
})
const shellPage = await shell.newPage()
for (const w of WIDTHS) {
  await shellPage.setViewportSize({ width: w, height: w < 768 ? 800 : 900 })
  await shellPage.goto(`${BASE}/checkout`, { waitUntil: 'load' })
  await shellPage.screenshot({ path: path.join(OUT, `skeleton-${w}.png`), fullPage: false })
}

await browser.close()
console.log(JSON.stringify(report, null, 2))
