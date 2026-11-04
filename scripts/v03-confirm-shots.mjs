#!/usr/bin/env node
/**
 * V03 proof: the thank-you page at 380, 768 and 1440, written to docs/V03/,
 * with horizontal overflow and every visible control under 44px measured per
 * shot and printed as JSON so the doc can quote the run.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 ORDER_ID=<a paid order of the e2e customer> \
 *     node scripts/v03-confirm-shots.mjs
 *
 * NOTHING IS BOUGHT. It takes one session for the seeded E2E customer and opens one
 * of that customer's existing paid orders through `/checkout/confirm`, which
 * redirects to `/checkout/return`; that page only reads once an order is paid.
 *
 * Browse localhost, not 127.0.0.1: server actions reject a mismatched origin.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const ORDER_ID = process.env.ORDER_ID
const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local'
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1'
const OUT = path.join(process.cwd(), 'docs', 'V03')
const WIDTHS = [380, 768, 1440]

if (!ORDER_ID) {
  console.error('ORDER_ID is required')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })

async function measure(page) {
  return page.evaluate(() => {
    const small = []
    const root = document.querySelector('.checkout-page')
    for (const el of root?.querySelectorAll('button, a[href], input, textarea') ?? []) {
      if (el.type === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (el.closest('[aria-hidden="true"]')) continue
      if (r.width < 44 || r.height < 44) {
        small.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        })
      }
    }
    // Text cut off by its own box: anything whose content is wider than it.
    const clipped = [...(root?.querySelectorAll('*') ?? [])]
      .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1)
      .filter((el) => getComputedStyle(el).overflowX !== 'visible')
      .map((el) => el.className || el.tagName)
    const pick = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      under44: small,
      clipped,
      h1: pick('h1'),
      orderNumber: pick('[data-testid="order-number"]'),
      total: pick('[data-testid="order-total"]'),
      coupons: document.querySelectorAll('[data-testid="coupon-code"]').length,
      qr: document.querySelectorAll('[data-testid="coupon-qr"] img').length,
      business: document.querySelectorAll('[data-testid="business-details"]').length,
      mapLinks: document.querySelectorAll('[data-testid^="map-"]').length,
      invoice: Boolean(
        document.querySelector('[data-testid="invoice-download"], [data-testid="invoice-pending"]'),
      ),
      continue: Boolean(document.querySelector('.confirm-continue a[href="/products"]')),
      tel: document.querySelectorAll('a[href^="tel:"]').length,
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

// Not through /login: the form verifies Turnstile, which a script cannot pass.
// A password grant for the same fixture gives the same session, written in the
// cookie shape @supabase/ssr reads (`base64-` + base64url JSON, chunked).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const grant = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!grant.ok) throw new Error(`password grant ${grant.status}`)
const session = await grant.json()
const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
const CHUNK = 3180
const name = `sb-${ref}-auth-token`
const cookies =
  value.length <= CHUNK
    ? [{ name, value }]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => ({
        name: `${name}.${i}`,
        value: value.slice(i * CHUNK, (i + 1) * CHUNK),
      }))
await context.addCookies(cookies.map((c) => ({ ...c, domain: hostname, path: '/' })))
await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' })
report.signedIn = new URL(page.url()).pathname

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 })
  await page.goto(`${BASE}/checkout/confirm?order_id=${ORDER_ID}`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .locator('.confirm-overview')
    .waitFor({ timeout: 30_000 })
    .catch(async () => {
      await page.screenshot({ path: '/tmp/v03dbg/fail.png' })
      throw new Error(
        `no overview at ${page.url()}: ${(await page.locator('h1').allTextContents()).join('|')}`,
      )
    })
  await page.waitForTimeout(400)
  report[`landed-${w}`] = new URL(page.url()).pathname
  await page.screenshot({ path: path.join(OUT, `confirm-${w}.png`), fullPage: true })
  await page.screenshot({ path: path.join(OUT, `confirm-fold-${w}.png`), fullPage: false })
  report[`confirm-${w}`] = await measure(page)
}

console.log(JSON.stringify(report, null, 1))
await browser.close()
