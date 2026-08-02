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
const MINE = process.env.MINE_URL ?? 'http://localhost:3000/product/demo-coupon-2'

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
  await p.screenshot({ path: `refs/coupon-${name}.png`, fullPage: true })
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

// ---------------------------------------------------------------------------
// Pixel band diff. Reported with the caveat it deserves: the two pages show
// DIFFERENT products (the live קופון-טסט is not in this database), so the
// number measures content plus layout, and only the trend across runs is
// meaningful. The structural table above is the fidelity signal.
// ---------------------------------------------------------------------------
const { readFileSync } = await import('node:fs')
const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`
const b2 = await chromium.launch()
const pg = await b2.newPage()
await pg.goto('about:blank')
const bands = await pg.evaluate(
  async ([liveSrc, mineSrc]) => {
    const load = (src) =>
      new Promise((res) => {
        const i = new Image()
        i.onload = () => res(i)
        i.src = src
      })
    const [a, b] = await Promise.all([load(liveSrc), load(mineSrc)])
    const W = Math.min(a.width, b.width)
    const H = Math.min(a.height, b.height)
    const draw = (img) => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      c.getContext('2d').drawImage(img, 0, 0)
      return c.getContext('2d').getImageData(0, 0, W, H).data
    }
    const da = draw(a)
    const db = draw(b)
    const BAND = 200
    const out = []
    for (let y0 = 0; y0 < H; y0 += BAND) {
      const y1 = Math.min(H, y0 + BAND)
      let diff = 0
      let total = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = 0; x < W; x += 2) {
          const i = (y * W + x) * 4
          const d =
            Math.abs(da[i] - db[i]) +
            Math.abs(da[i + 1] - db[i + 1]) +
            Math.abs(da[i + 2] - db[i + 2])
          if (d > 45) diff++
          total++
        }
      }
      out.push({ band: `${y0}-${y1}px`, diffPct: +((100 * diff) / total).toFixed(1) })
    }
    return { W, H, out }
  },
  [toDataUrl('refs/coupon-live.png'), toDataUrl('refs/coupon-mine.png')],
)
await b2.close()
console.log(`\npixel band diff over ${bands.W}x${bands.H} (different products; trend only)`)
console.table(bands.out)
const overall = bands.out.reduce((s, b) => s + b.diffPct, 0) / bands.out.length
console.log(`mean band difference: ${overall.toFixed(1)}%`)
