#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
/**
 * Capture the Electro template with a real browser.
 *
 * WHY THIS EXISTS. Every `refs/electro-*.html` in this repo is a Cloudflare
 * interstitial -- "Just a moment...", ~5.7KB, identical byte size across six
 * different URLs -- because they were fetched over plain HTTP and
 * electro.madrasthemes.com answers automation with a 403 and a JS challenge.
 * Several goals are written against `electro.html` as if it were the template.
 * It is not, and building geometry from it would be building from a block page.
 *
 * A headless browser can pass the challenge because it runs the JavaScript. This
 * waits for the challenge to clear rather than screenshotting it.
 *
 * Usage: node scripts/capture-electro.mjs <url> <slug> [--add-to-cart=<id>]
 * Writes refs/<slug>.html, refs/<slug>_{380,768,1440}.png and
 * refs/<slug>_computed.json.
 *
 * `--add-to-cart=<id>` seeds the demo's WooCommerce cart with one line before
 * the real navigation. Without it `/checkout/` redirects to an empty cart and
 * `/cart/` is a one-line "your cart is currently empty" panel, and neither is
 * a reference for the filled state scripts/compare.mjs seeds locally.
 */
import { chromium } from '@playwright/test'
import { parseCaptureArgs } from './capture-electro-args.mjs'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(homedir(), 'Library/Caches/ms-playwright')

const { url, slug, seedUrl } = parseCaptureArgs(process.argv.slice(2))
const WIDTHS = [380, 768, 1440]

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const browser = await chromium.launch({
  args: ['--disable-blink-features=AutomationControlled'],
})
const context = await browser.newContext({
  userAgent: UA,
  viewport: { width: 1440, height: 1000 },
  locale: 'en-US',
  timezoneId: 'Asia/Jerusalem',
})
// navigator.webdriver is the first thing a challenge looks at.
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})

const page = await context.newPage()
let blocked = true
try {
  // WARM UP ON THE ORIGIN FIRST. The product URL answered "403 - Forbidden"
  // on a cold context while the home page passed the challenge: the clearance
  // cookie is set by the challenge and a deep link that arrives without one is
  // refused outright. One hop through the origin, then the real navigation.
  const origin = new URL(url).origin
  if (url !== `${origin}/`) {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
  }
  if (seedUrl) {
    // The seed is a GET the challenge may replay after it clears, so it goes
    // through the same warmed context and gets its own settle time. The cart
    // cookie is what this navigation is for; the page behind it is not read.
    await page.goto(seedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    console.log(`seeded the demo cart via ${seedUrl}`)
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // The challenge replaces the document when it clears. Poll for real content.
  for (let i = 0; i < 20; i++) {
    const title = await page.title()
    // "403 - Forbidden" is the OTHER refusal, and the first version of this
    // script did not look for it: it wrote an 81KB error page to
    // refs/electro_product.html and reported success.
    if (/just a moment|attention required/i.test(title)) {
      await page.waitForTimeout(1500)
      continue
    }
    if (/^40[0-9]|forbidden|access denied/i.test(title)) break
    blocked = false
    break
  }
} catch (error) {
  console.error('navigation failed:', error.message)
}

const title = await page.title().catch(() => '(none)')
const bytes = (await page.content().catch(() => '')).length
const cartLines = await page
  .evaluate(() => document.querySelectorAll('.woocommerce-cart-form__cart-item, .cart_item').length)
  .catch(() => 0)
console.log(JSON.stringify({ url, blocked, title, bytes, cartLines }))

// A seeded capture of an empty cart is the exact wrong reference: it scores
// and nobody looks at it. Refuse rather than write it.
if (seedUrl && !blocked && cartLines === 0) {
  console.error(
    'BLOCKED: --add-to-cart was given but the page shows no cart line. Nothing written.',
  )
  await browser.close()
  process.exit(3)
}

if (blocked) {
  console.error('BLOCKED: the challenge did not clear. Nothing written.')
  await browser.close()
  process.exit(2)
}

await page.waitForLoadState('networkidle').catch(() => {})
writeFileSync(resolve('refs', `${slug}.html`), await page.content())

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 1000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: resolve('refs', `${slug}_${width}.png`), fullPage: true })
}

await page.setViewportSize({ width: 1440, height: 1000 })
const computed = await page.evaluate(() => {
  const PROPS = [
    'color',
    'backgroundColor',
    'borderRadius',
    'border',
    'boxShadow',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textTransform',
    'padding',
    'margin',
    'gap',
    'width',
    'height',
    'display',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'gridTemplateColumns',
    'aspectRatio',
    'transitionDuration',
    'transitionTimingFunction',
    'zIndex',
  ]
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    const row = {
      tag: el.tagName.toLowerCase(),
      cls: el.className?.toString?.().slice(0, 200) ?? '',
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    }
    for (const p of PROPS) row[p] = s[p]
    out.push(row)
  }
  return out
})
writeFileSync(resolve('refs', `${slug}_computed.json`), JSON.stringify(computed))
console.log(`wrote refs/${slug}.html, three screenshots and ${computed.length} computed rows`)
await browser.close()
