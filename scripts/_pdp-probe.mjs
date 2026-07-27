import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
// Dump the geometry of the product-detail page so PDP work is driven by
// measurements instead of eyeballed screenshots.
// Usage: node scripts/_pdp-probe.mjs <url>
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const url = process.argv[2]
if (!url) {
  console.error('usage: node scripts/_pdp-probe.mjs <url>')
  process.exit(2)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await p.waitForTimeout(url.includes('localhost') ? 2000 : 4000)

const rows = await p.evaluate(() => {
  const out = []
  const seen = new Set()
  const push = (label, el) => {
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) return
    const key = `${label}|${Math.round(r.x)}|${Math.round(r.y)}`
    if (seen.has(key)) return
    seen.add(key)
    const cs = getComputedStyle(el)
    out.push({
      label,
      tag: el.tagName.toLowerCase(),
      x: Math.round(r.x + window.scrollX),
      y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
      font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight}`,
      color: cs.color,
      text: (el.textContent ?? '').trim().slice(0, 44).replace(/\s+/g, ' '),
    })
  }
  push('h1', document.querySelector('h1'))
  for (const sel of [
    'nav.woocommerce-breadcrumb',
    'nav[aria-label="נתיב ניווט"]',
    '[data-pdp="container"]',
    '[data-pdp="columns"]',
    '[data-pdp="summary"]',
    '[data-pdp="gallery"]',
    'div.summary',
    'div.woocommerce-product-gallery',
    'form.cart',
    'p.price',
    '.electro-price',
    'button[type="submit"]',
    '.single_add_to_cart_button',
    '.product_meta',
    'section.related',
    '.related.products',
    'footer',
    '.footer-newsletter',
    '.newsletter',
  ]) {
    for (const el of document.querySelectorAll(sel)) push(sel, el)
  }
  // Every h2/h3 landmark, so section starts are comparable across the two pages.
  for (const el of document.querySelectorAll('h2, h3')) push('heading', el)
  return out.sort((a, z) => a.y - z.y)
})

const docH = await p.evaluate(() => document.documentElement.scrollHeight)
await b.close()

console.log(`# ${url}   docHeight=${docH}`)
for (const r of rows) {
  console.log(
    `${String(r.y).padStart(5)}  h=${String(r.h).padStart(4)}  x=${String(r.x).padStart(4)} w=${String(r.w).padStart(4)}  ${r.font.padEnd(22)} ${r.label.padEnd(28)} ${r.text}`,
  )
}
