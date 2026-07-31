/**
 * Text-only measurement of the LIVE KenyonExpress checkout.
 *
 * The brief points at Electro for this, and Electro is unreachable: it sits
 * behind Cloudflare and answers 403 ("Just a moment...") to a browser user
 * agent, which is why refs/measure-cart-checkout.json recorded found=0/18 on
 * cart and 0/15 on checkout at both breakpoints. There is nothing in that file
 * to verify against.
 *
 * kenyonexpress.co.il is not blocked, and it is the page actually being
 * rebuilt, so it is the reference that can exist. The live cart is filled first
 * with WooCommerce's plain add-to-cart GET, because /checkout/ redirects to the
 * cart when the basket is empty and an empty measurement is worse than none.
 *
 * Writes refs/ke-checkout-measured.json. No screenshots by design.
 *
 *   node refs/measure-ke-checkout.mjs
 */

import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = path.resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const SITE = 'https://kenyonexpress.co.il'
const ATC_ID = process.env.LIVE_ATC_ID ?? '6166'
const BREAKPOINTS = [380, 768, 1440]

const SPEC = [
  { label: 'container', sel: '.woocommerce, #content, .site-content' },
  { label: 'checkout-form', sel: 'form.checkout, form.woocommerce-checkout' },
  { label: 'billing-block', sel: '#customer_details, .woocommerce-billing-fields' },
  { label: 'field-row', sel: '.form-row' },
  { label: 'field-input', sel: '.form-row input.input-text, input.input-text' },
  { label: 'field-label', sel: '.form-row label, form.checkout label' },
  { label: 'order-review', sel: '#order_review, .woocommerce-checkout-review-order' },
  { label: 'review-total', sel: '.order-total .amount, tr.order-total .amount' },
  { label: 'payment-box', sel: '#payment, .woocommerce-checkout-payment' },
  { label: 'place-order', sel: '#place_order, button#place_order' },
]

const PROPS = [
  'direction',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
  'min-height',
  'max-width',
  'padding-top',
  'padding-inline-start',
  'text-align',
]

const EXTRACT = ([specs, props]) => {
  const out = {}
  let found = 0
  for (const item of specs) {
    const el = document.querySelector(item.sel)
    if (!el) {
      out[item.label] = null
      continue
    }
    found += 1
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const rec = { rect_w: Math.round(r.width), rect_h: Math.round(r.height) }
    for (const p of props) rec[p] = cs.getPropertyValue(p).trim()
    out[item.label] = rec
  }
  out.__found = found
  out.__of = specs.length
  return out
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'he-IL' })
const page = await ctx.newPage()

// Fill the live basket, or /checkout/ bounces to /cart/ and measures nothing.
await page.goto(`${SITE}/?add-to-cart=${ATC_ID}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
})
await page.waitForTimeout(2500)

const result = { site: SITE, atcId: ATC_ID, checkout: {} }

for (const width of BREAKPOINTS) {
  await page.setViewportSize({ width, height: 1200 })
  const resp = await page
    .goto(`${SITE}/checkout/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch((e) => ({ err: e.message.split('\n')[0] }))

  if (resp && resp.err) {
    result.checkout[width] = { __error: resp.err }
    continue
  }

  await page.waitForTimeout(2000)
  const data = await page.evaluate(EXTRACT, [SPEC, PROPS])
  data.__url = page.url()
  data.__status = resp && resp.status ? resp.status() : 0
  result.checkout[width] = data
  console.log(`checkout @${width}: found ${data.__found}/${data.__of} at ${data.__url}`)
}

await writeFile(
  path.join(OUT, 'ke-checkout-measured.json'),
  JSON.stringify(result, null, 2),
  'utf8',
)
await browser.close()
console.log('wrote refs/ke-checkout-measured.json')
