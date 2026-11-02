/**
 * C149: checks every demo product page for the required blocks and saves
 * screenshots at 380 and 1440 to docs/C149/.
 *
 * Run: node scripts/demo/shoot-demo-deals.mjs [baseUrl]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { DEALS } from './demo-deals.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.argv[2] ?? 'http://localhost:3149'
const out = resolve(root, 'docs/C149')
mkdirSync(out, { recursive: true })

const COUPON = new Set([
  'restaurant',
  'cafe',
  'dessert-icecream',
  'bar-cocktails',
  'massage',
  'spa',
  'beauty-treatment',
  'laser-hair-removal',
  'hair-barber',
  'alternative-medicine',
  'fitness-yoga',
  'tzimmer',
  'hotel',
  'vacation-package',
  'flight',
  'organized-tour',
  'attraction-tickets',
  'experience-tour',
  'workshop-course',
  'professional-service',
  'store-voucher',
  'general-coupon',
])

const browser = await chromium.launch()
const rows = []
for (const deal of DEALS) {
  const slug = `demo-${deal.master}`
  const coupon = COUPON.has(deal.master)
  for (const width of [380, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, locale: 'he-IL' })
    const res = await page.goto(`${base}/product/${slug}`, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    })
    // Consent banner off the shot: same click a shopper makes.
    await page
      .getByRole('button', { name: 'אישור', exact: true })
      .click({ timeout: 3000 })
      .catch(() => {})
    // Walk the page so every lazy image (related cards) loads before the shot.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    })
    await page
      .locator('.pdp-related')
      .scrollIntoViewIfNeeded()
      .catch(() => {})
    await page.waitForTimeout(400)
    const c = await page.evaluate(() => {
      const q = (s) => document.querySelector(s)
      const text = document.body.innerText
      const price = q('[data-pdp="summary"]')?.innerText ?? ''
      const imgs = [...document.querySelectorAll('[data-pdp="columns"] img')].filter(
        (i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 0,
      ).length
      return {
        title: q('h1')?.textContent?.trim() ?? '',
        description: !!q('.pdp-details__text'),
        highlights: document.querySelectorAll('[data-pdp="highlights"] li').length,
        specs: document.querySelectorAll('[data-pdp="specs"] tr').length,
        supplier: !!q('section[aria-label="פרטי ספק"] a[href^="/s/"]'),
        city_pin: !!q('a[href*="google.com/maps"], a[href*="maps"]') || /\bעיר\b/.test(text),
        waze: !!q('a[href*="waze.com"]'),
        wame: !!q('a[href*="wa.me"]'),
        legal: !!q('[data-pdp="legal"]') && text.includes('033798513') && text.includes('14ג'),
        whole_shekels: !/₪\s?\d+[.,]\d{2}\b|\d+[.,]\d{2}\s?₪/.test(price),
        strike: !!q('[data-pdp="summary"] del, [data-pdp="summary"] .line-through'),
        savings: /\d+%-/.test(price),
        validity: text.includes('המבצע בתוקף עד'),
        qr: !!q('.pdp-coupon-qr img'),
        eight_digit: text.includes('8 ספרות'),
        related: document.querySelectorAll('.pdp-related a[href^="/product/"]').length,
        images: imgs,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    const file = `${slug}-${width}.jpg`
    await page.screenshot({ path: resolve(out, file), fullPage: true, type: 'jpeg', quality: 50 })
    const ok =
      res?.status() === 200 &&
      c.description &&
      c.highlights >= 3 &&
      c.specs >= 3 &&
      c.supplier &&
      c.waze &&
      c.wame &&
      c.legal &&
      c.whole_shekels &&
      c.strike &&
      c.savings &&
      c.validity &&
      c.related > 0 &&
      c.images > 0 &&
      !c.overflow &&
      (!coupon || (c.qr && c.eight_digit))
    rows.push({
      slug,
      width,
      status: res?.status(),
      type: coupon ? 'coupon' : 'physical',
      ok,
      ...c,
      file,
    })
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${width} ${slug} hl=${c.highlights} specs=${c.specs} rel=${c.related} img=${c.images} waze=${c.waze} wa=${c.wame} legal=${c.legal} strike=${c.strike} save=${c.savings} valid=${c.validity}${coupon ? ` qr=${c.qr} 8d=${c.eight_digit}` : ''} ovf=${c.overflow}`,
    )
    await page.close()
  }
}
await browser.close()
writeFileSync(resolve(out, 'checks.json'), `${JSON.stringify(rows, null, 2)}\n`)
const failed = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - failed.length}/${rows.length} page checks passed`)
process.exit(failed.length ? 1 : 0)
