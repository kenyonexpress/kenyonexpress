/**
 * Pixel-compare hero: refs/ke_live_singlefile.html vs localhost:3000 @ 1440px.
 * Writes refs/live.png (singlefile) and refs/mine.png (localhost).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const VIEWPORT = { width: 1440, height: 900 }
const SINGLEFILE = path.resolve('refs/ke_live_singlefile.html')
const OUT_LIVE = 'refs/live.png'
const OUT_MINE = 'refs/mine.png'

async function shotHero(page, selector, outPath) {
  await page.waitForSelector(selector, { timeout: 60000 })
  const el = page.locator(selector).first()
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await el.screenshot({ path: outPath })
  const meta = await sharp(outPath).metadata()
  return { path: outPath, width: meta.width, height: meta.height }
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'he-IL', deviceScaleFactor: 1 })

// live = singlefile
const livePage = await ctx.newPage()
const fileUrl = pathToFileURL(SINGLEFILE).href
await livePage.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
await livePage.waitForTimeout(2000)
const liveShot = await shotHero(livePage, '.elementor-element-1b49fac0', OUT_LIVE)

// mine = localhost
const minePage = await ctx.newPage()
await minePage.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 120000 })
await minePage.waitForTimeout(1500)
const mineShot = await shotHero(minePage, '.ke-hero-exact-root', OUT_MINE)

await browser.close()

// pixel diff
const w = Math.min(liveShot.width, mineShot.width)
const h = Math.min(liveShot.height, mineShot.height)

const liveRaw = await sharp(OUT_LIVE).resize(w, h).ensureAlpha().raw().toBuffer()
const mineRaw = await sharp(OUT_MINE).resize(w, h).ensureAlpha().raw().toBuffer()

let diffPixels = 0
const total = w * h
const threshold = 24
for (let i = 0; i < liveRaw.length; i += 4) {
  const dr = Math.abs(liveRaw[i] - mineRaw[i])
  const dg = Math.abs(liveRaw[i + 1] - mineRaw[i + 1])
  const db = Math.abs(liveRaw[i + 2] - mineRaw[i + 2])
  if (dr + dg + db > threshold) diffPixels++
}

const pct = ((diffPixels / total) * 100).toFixed(2)

// per-region (3 columns + slider)
const regions = [
  { name: 'עמודת קטגוריות', x: 0, w: Math.floor(w * 0.28) },
  { name: 'סליידר מרכז', x: Math.floor(w * 0.28), w: Math.floor(w * 0.44) },
  { name: 'באנרים צד', x: Math.floor(w * 0.72), w: Math.floor(w * 0.28) },
]

const regionRows = regions.map((r) => {
  let regionDiff = 0
  let regionTotal = 0
  for (let y = 0; y < h; y++) {
    for (let x = r.x; x < r.x + r.w && x < w; x++) {
      const i = (y * w + x) * 4
      const dr = Math.abs(liveRaw[i] - mineRaw[i])
      const dg = Math.abs(liveRaw[i + 1] - mineRaw[i + 1])
      const db = Math.abs(liveRaw[i + 2] - mineRaw[i + 2])
      if (dr + dg + db > threshold) regionDiff++
      regionTotal++
    }
  }
  return {
    region: r.name,
    diffPct: ((regionDiff / regionTotal) * 100).toFixed(2),
    match: regionDiff / regionTotal < 0.05,
  }
})

// slide bullets check via extract json if exists
const extractPath = 'refs/ke_live_singlefile-hero-extract.json'
let slideRows = []
if (fs.existsSync(extractPath)) {
  const { slides } = JSON.parse(fs.readFileSync(extractPath, 'utf8'))
  slideRows = slides.map((s) => ({
    slide: s.key,
    layersInFile: s.layerCount,
    hasText: s.layers?.length > 0,
    texts: (s.layers || []).map((l) => l.text).join(' | ') || '(ריק בקובץ)',
  }))
}

const report = {
  viewport: VIEWPORT.width,
  live: liveShot,
  mine: mineShot,
  dimensionMismatch:
    liveShot.width !== mineShot.width || liveShot.height !== mineShot.height
      ? `live ${liveShot.width}x${liveShot.height} vs mine ${mineShot.width}x${mineShot.height} — compared on crop ${w}x${h}`
      : null,
  compared: { width: w, height: h },
  totalDiffPct: pct,
  regions: regionRows,
  slides: slideRows,
}

fs.writeFileSync('refs/hero-compare-report.json', JSON.stringify(report, null, 2))

console.log(JSON.stringify(report, null, 2))
