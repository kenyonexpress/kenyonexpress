// Structural comparison of the coupon PDP against live kenyonexpress.co.il.
//
// A raw pixel diff is not meaningful here: the live coupon (קופון-טסט) does not
// exist in this database, so a screenshot diff would measure different CONTENT,
// not layout fidelity. This compares the computed geometry and typography of the
// matching elements instead, which is what "1:1" actually has to mean when the
// two pages show different products.
//
// Usage (Terminal, app already running on :3000):
//   node scripts/compare-coupon-live.mjs
//
// Writes refs/coupon-live.png and refs/coupon-mine.png alongside the table.
//
// Known deliberate delta: the container is 1320px here vs 1200px live. That is
// the standing project override recorded in STATE.md, not a regression, and it
// accounts for the width differences on every child element.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}
const VIEW = { width: 1440, height: 900 }
const LIVE = `https://kenyonexpress.co.il/product/${encodeURIComponent('קופון-טסט')}/`
const MINE = 'http://localhost:3000/product/barbecue'

const probe = () => {
  const g = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      fs: s.fontSize,
      lh: s.lineHeight,
      color: s.color,
    }
  }
  const pick = (sels) => {
    for (const s of sels) {
      const e = document.querySelector(s)
      if (e) return g(e)
    }
    return null
  }
  return {
    h1: pick(['h1.product_title', 'h1']),
    summary: pick([
      '.summary.entry-summary',
      'main .grid > div:nth-child(2)',
      'main .grid > *:nth-child(2)',
    ]),
    gallery: pick([
      '.woocommerce-product-gallery',
      'main .grid > div:first-child',
      'main .grid > *:first-child',
    ]),
    container: pick(['.single-product-wrapper', 'main .max-w-page', 'main > div']),
    price: pick(['.summary .price', '[class*="text-price"]']),
    docDir: document.documentElement.dir || getComputedStyle(document.body).direction,
  }
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
const out = {}
for (const [name, url] of [
  ['live', LIVE],
  ['mine', MINE],
]) {
  const p = await ctx.newPage()
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  } catch {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  }
  await p.waitForTimeout(3000)
  out[name] = await p.evaluate(probe)
  await p.screenshot({ path: `refs/coupon-${name}.png`, fullPage: false })
  await p.close()
}
await b.close()

const rows = []
for (const key of Object.keys(out.live)) {
  const L = out.live[key]
  const M = out.mine[key]
  if (L && typeof L === 'object' && M && typeof M === 'object') {
    for (const f of Object.keys(L)) {
      const lv = L[f]
      const mv = M[f]
      const num = typeof lv === 'number' && typeof mv === 'number'
      rows.push({
        el: key,
        prop: f,
        live: lv,
        mine: mv,
        delta: num ? +(mv - lv).toFixed(1) : lv === mv ? 'same' : 'DIFF',
      })
    }
  } else rows.push({ el: key, prop: '', live: L, mine: M, delta: L === M ? 'same' : 'DIFF' })
}
console.table(rows)
