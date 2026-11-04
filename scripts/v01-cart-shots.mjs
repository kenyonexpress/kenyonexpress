#!/usr/bin/env node
/**
 * V01 proof: /cart (filled, then emptied) and the cart drawer at 380, 768 and
 * 1440, written to docs/V01/. Also measures, per width, horizontal overflow
 * and every visible cart control under the 44px touch floor, and prints them
 * as JSON so the doc can quote the run instead of a claim.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 node scripts/v01-cart-shots.mjs
 *
 * Browse localhost, not 127.0.0.1: server actions reject a mismatched origin.
 * The guest cart this fills is a real row in whatever database the server
 * points at; it is a guest cart and the reaper clears it.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const OUT = path.join(process.cwd(), 'docs', 'V01')
const WIDTHS = [380, 768, 1440]
const BUY = /הוסף לסל|קנה עכשיו/
const CART_BUTTON = /עגלת קניות, (\d+) פריטים/

mkdirSync(OUT, { recursive: true })

async function measure(page, scope) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector) ?? document.body
    const small = []
    for (const el of root.querySelectorAll('button, a[href], input')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (r.width < 44 || r.height < 44) {
        small.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        })
      }
    }
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      under44: small,
    }
  }, scope)
}

// channel 'chromium' runs the full build in new headless mode; only that
// build is installed for this Playwright version here.
const browser = await chromium.launch({ channel: 'chromium' })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'he-IL',
})
const { hostname } = new URL(BASE)
await context.addCookies([{ name: 'ke_consent', value: 'denied.3', domain: hostname, path: '/' }])
const page = await context.newPage()
const report = {}

async function shoot(name, width, scope) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true })
  report[`${name}-${width}`] = await measure(page, scope)
}

// 1. Fill it with two products from the catalogue.
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
  if (added >= 2) break
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  const buy = page.locator('[data-pdp="summary"]').getByRole('button', { name: BUY }).first()
  if (!(await buy.isEnabled({ timeout: 5_000 }).catch(() => false))) continue
  await page.waitForLoadState('networkidle').catch(() => undefined)
  // Wait for the server action's answer, not the badge. The badge moves
  // optimistically before the server replies, and navigating on it cancels
  // the add in flight; the next add then races the first one's insert and
  // loses on carts_one_per_guest_session_uniq (23505). Measured here.
  const answered = page.waitForResponse((r) => r.request().method() === 'POST', {
    timeout: 30_000,
  })
  await buy.click()
  const ok = await answered.then((r) => r.ok()).catch(() => false)
  if (ok) added += 1
}
report.added = added

// 2. The filled cart page.
await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' })
await page.locator('.cart-table').waitFor({ timeout: 20_000 })
for (const w of WIDTHS) await shoot('cart', w, '.cart-page')

// 3. The drawer is the phone surface (display:none from 768); the mini-cart
//    dropdown is the desktop one. Each is shot at the widths it exists at.
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 })
  await page.goto(`${BASE}/cart`, { waitUntil: 'load' })
  // Open once the server cart has landed, so the panel shows the lines.
  await page.locator('.cart-table').waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: CART_BUTTON }).filter({ visible: true }).first().click()
  await page.waitForTimeout(600)
  const scope = w < 768 ? '.cart-drawer' : '.mini-cart__panel'
  await page.screenshot({ path: path.join(OUT, `drawer-${w}.png`), fullPage: false })
  report[`drawer-${w}`] = await measure(page, scope)
  await page.keyboard.press('Escape')
}

// 4. Empty it with the actions-row pill and shoot the empty state.
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/cart`, { waitUntil: 'load' })
await page.locator('.cart-table').waitFor({ timeout: 20_000 })
await page.getByRole('button', { name: 'רוקן עגלה' }).click()
await page.locator('.cart-empty').waitFor({ timeout: 20_000 })
for (const w of WIDTHS) await shoot('cart-empty', w, '.cart-page')

await browser.close()
console.log(JSON.stringify(report, null, 2))
