import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
// Measure pixel mismatch between refs/live.png and refs/mine.png
// Per-100px band report + overall for the first 2600px. No new deps:
// decodes PNGs in headless chromium via canvas.
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`
const liveUrl = toDataUrl('refs/live.png')
const mineUrl = toDataUrl('refs/mine.png')

const b = await chromium.launch()
const page = await b.newPage()
await page.goto('about:blank')

const report = await page.evaluate(
  async ({ liveUrl, mineUrl }) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = rej
        img.src = src
      })
    const [live, mine] = await Promise.all([load(liveUrl), load(mineUrl)])
    const W = Math.min(live.width, mine.width)
    const H = Math.min(live.height, mine.height, 2600)
    const data = (img) => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, W, H).data
    }
    const a = data(live)
    const m = data(mine)
    const TOL = 24 // per-channel tolerance for AA noise
    const BAND = 100
    const bands = []
    let totalDiff = 0
    for (let y0 = 0; y0 < H; y0 += BAND) {
      const y1 = Math.min(y0 + BAND, H)
      let diff = 0
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4
          if (
            Math.abs(a[i] - m[i]) > TOL ||
            Math.abs(a[i + 1] - m[i + 1]) > TOL ||
            Math.abs(a[i + 2] - m[i + 2]) > TOL
          )
            diff++
        }
      }
      totalDiff += diff
      bands.push({ y0, y1, pct: +((100 * diff) / ((y1 - y0) * W)).toFixed(1) })
    }
    return {
      W,
      H,
      liveSize: { w: live.width, h: live.height },
      mineSize: { w: mine.width, h: mine.height },
      overallPct: +((100 * totalDiff) / (W * H)).toFixed(2),
      bands,
    }
  },
  { liveUrl, mineUrl },
)

await b.close()

// The number, written down rather than only printed: compare.mjs runs this as a
// child with inherited stdio, and the pixel gate has to be decided by the
// script that also knows which page was measured and how much content each side
// carried. Scraping it back out of the log would be a parser nobody asked for.
writeFileSync(
  'refs/band-report.json',
  JSON.stringify({ page: process.env.COMPARE_PAGE ?? null, ...report }),
)

console.log(
  `live: ${report.liveSize.w}x${report.liveSize.h}  mine: ${report.mineSize.w}x${report.mineSize.h}`,
)
console.log(`compared: ${report.W}x${report.H}`)
console.log(`OVERALL first ${report.H}px: ${report.overallPct}%`)
console.log('worst bands:')
for (const band of [...report.bands].sort((x, y) => y.pct - x.pct).slice(0, 12)) {
  console.log(`  y ${String(band.y0).padStart(4)}-${String(band.y1).padEnd(4)}  ${band.pct}%`)
}
console.log('all bands:')
for (const band of report.bands) {
  const bar = '#'.repeat(Math.round(band.pct / 2))
  console.log(`  y ${String(band.y0).padStart(4)}  ${String(band.pct).padStart(5)}%  ${bar}`)
}
