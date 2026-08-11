/**
 * Measure the four PDP elements under discussion on any of the three
 * references, so the numbers come from the rendered page rather than from a
 * screenshot read by eye.
 *
 * Usage: node scripts/_pdp-elements.mjs <url> [label]
 *
 * Each metric lists candidate selectors most-specific first and reports the
 * first that resolves, alongside WHICH selector matched. A metric that matches
 * nothing prints `-` rather than 0: a missing element and a zero-height element
 * are different findings, and collapsing them is how a comparison ends up
 * scoring a page that never rendered.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const url = process.argv[2]
const label = process.argv[3] ?? url
if (!url) {
  console.error('usage: node scripts/_pdp-elements.mjs <url> [label]')
  process.exit(2)
}

const METRICS = [
  {
    key: 'price-summary-height',
    axis: 'height',
    selectors: [
      '.pdp-summary',
      '.summary.entry-summary',
      '.entry-summary',
      'div.summary',
      '.product .summary',
    ],
  },
  {
    key: 'product-card-width',
    axis: 'width',
    selectors: [
      '.pdp-related__grid > *',
      '.products .product',
      'li.product',
      '.product-card',
      '.woocommerce-loop-product__link',
      '.category-page__grid > *',
    ],
  },
  {
    key: 'gallery-padding',
    axis: 'padding',
    selectors: [
      '.pdp-gallery__frame',
      '.woocommerce-product-gallery',
      '.woocommerce-product-gallery__wrapper',
      '.product-gallery',
      'figure.woocommerce-product-gallery__wrapper',
    ],
  },
  {
    key: 'stepper-button',
    axis: 'box',
    selectors: [
      '.pdp-buy__step',
      '.quantity .plus',
      '.quantity input.qty',
      '.quantity',
      'input[type="number"].qty',
    ],
  },
]

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(url.includes('localhost') ? 2500 : 5000)

const out = await p.evaluate((metrics) => {
  const round = (n) => Math.round(n * 10) / 10
  return metrics.map((m) => {
    for (const sel of m.selectors) {
      const el = document.querySelector(sel)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const cs = getComputedStyle(el)
      let value
      if (m.axis === 'height') value = `${round(r.height)}`
      else if (m.axis === 'width') value = `${round(r.width)}`
      else if (m.axis === 'padding')
        value = `${round(Number.parseFloat(cs.paddingTop))}/${round(
          Number.parseFloat(cs.paddingRight),
        )}/${round(Number.parseFloat(cs.paddingBottom))}/${round(
          Number.parseFloat(cs.paddingLeft),
        )}`
      else value = `${round(r.width)}x${round(r.height)}`
      return { key: m.key, selector: sel, value }
    }
    return { key: m.key, selector: null, value: '-' }
  })
}, METRICS)

console.log(`## ${label}`)
for (const row of out) {
  console.log(`${row.key}\t${row.value}\t${row.selector ?? 'no match'}`)
}

await b.close()
