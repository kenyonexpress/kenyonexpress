// Compare local category page vs live kenyonexpress.co.il category page.
// Writes refs/live-shop-cmp.png + refs/mine-shop-cmp.png and prints band diff.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const VIEW = { width: 1440, height: 900 }
const LIVE_URL = 'https://kenyonexpress.co.il/shop/'
const MINE_URL = 'http://localhost:3000/products'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })

const live = await ctx.newPage()
try {
  await live.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 60000 })
} catch {
  await live.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
}
await live.waitForTimeout(4000)
await live.screenshot({ path: 'refs/live-shop-cmp.png', fullPage: true })
console.log('live-shop-cmp.png written')

const mine = await ctx.newPage()
await mine.goto(MINE_URL, { waitUntil: 'networkidle', timeout: 60000 })
await mine.waitForTimeout(2000)
await mine.screenshot({ path: 'refs/mine-shop-cmp.png', fullPage: true })
console.log('mine-shop-cmp.png written')

await b.close()

const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`
const b2 = await chromium.launch()
const page = await b2.newPage()
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
    const [liveImg, mineImg] = await Promise.all([load(liveUrl), load(mineUrl)])
    const W = Math.min(liveImg.width, mineImg.width)
    const H = Math.min(liveImg.height, mineImg.height, 2600)
    const data = (img) => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, W, H).data
    }
    const a = data(liveImg)
    const m = data(mineImg)
    const TOL = 24
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
      liveSize: { w: liveImg.width, h: liveImg.height },
      mineSize: { w: mineImg.width, h: mineImg.height },
      overallPct: +((100 * totalDiff) / (W * H)).toFixed(2),
      bands,
    }
  },
  {
    liveUrl: toDataUrl('refs/live-shop-cmp.png'),
    mineUrl: toDataUrl('refs/mine-shop-cmp.png'),
  },
)
await b2.close()

console.log(
  `live: ${report.liveSize.w}x${report.liveSize.h}  mine: ${report.mineSize.w}x${report.mineSize.h}`,
)
console.log(`compared: ${report.W}x${report.H}`)
console.log(`OVERALL first ${report.H}px: ${report.overallPct}%`)
console.log('all bands:')
for (const band of report.bands) {
  const bar = '#'.repeat(Math.round(band.pct / 2))
  console.log(`  y ${String(band.y0).padStart(4)}  ${String(band.pct).padStart(5)}%  ${bar}`)
}
