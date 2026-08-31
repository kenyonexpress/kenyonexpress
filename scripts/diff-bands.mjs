import { existsSync, readFileSync } from 'node:fs'
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
// compare.mjs shoots to a per-process path so two concurrent runs in one
// working directory cannot overwrite each other's evidence between the shot and
// this diff. Run standalone, the stable names are still the right default.
const liveUrl = toDataUrl(process.env.COMPARE_LIVE_PNG ?? 'refs/live.png')
const mineUrl = toDataUrl(process.env.COMPARE_MINE_PNG ?? 'refs/mine.png')

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

console.log(
  `live: ${report.liveSize.w}x${report.liveSize.h}  mine: ${report.mineSize.w}x${report.mineSize.h}`,
)
console.log(`compared: ${report.W}x${report.H}`)
console.log(`OVERALL first ${report.H}px: ${report.overallPct}%`)

/**
 * A band percentage only means something when the two pages are the same page.
 *
 * MEASURED, 2026-08-19. A `next start` left running from an earlier build kept
 * port 3311 and went on serving it long after `.next` was rebuilt. The home
 * page it served rendered 15562px tall against the live site's 5492px, and this
 * script dutifully reported OVERALL 45.53%. The same commit measured against a
 * server on the CURRENT build reported 11.07%. Nothing in the output said which
 * of the two numbers to believe, and the wrong one is the one that looks like a
 * catastrophic regression worth a day of chasing.
 *
 * The height ratio is the cheapest signal that separates them, and it is
 * unambiguous: a styling drift moves a page by a few percent, not by 3x. When
 * the ratio is this far out, the honest output is "these are different pages"
 * rather than a number.
 *
 * Deliberately a warning and not an exit code. This script prints; the caller
 * decides. Failing here would break `--page=search`, where the live and local
 * pages legitimately differ in length.
 */
const heightRatio = report.mineSize.h / report.liveSize.h
if (heightRatio > 1.6 || heightRatio < 0.62) {
  console.log('')
  console.log(
    `!! HEIGHT RATIO ${heightRatio.toFixed(2)}x — the percentage above is NOT a pixel gate.`,
  )
  console.log('!! These are structurally different pages, not the same page styled differently.')
  console.log('!! Most likely causes, in the order they have actually happened here:')
  console.log('!!   1. a stale `next start` holding the port and serving an older build')
  console.log('!!      (check: is the server older than .next/BUILD_ID?)')
  console.log('!!   2. the local page failed to load its data and rendered a fallback')
  console.log('!!      (check the server log for supabase.admin_key_invalid)')
  console.log('!! Fix the server, then re-measure. Do not chase the bands.')
}
console.log('worst bands:')
for (const band of [...report.bands].sort((x, y) => y.pct - x.pct).slice(0, 12)) {
  console.log(`  y ${String(band.y0).padStart(4)}-${String(band.y1).padEnd(4)}  ${band.pct}%`)
}
console.log('all bands:')
for (const band of report.bands) {
  const bar = '#'.repeat(Math.round(band.pct / 2))
  console.log(`  y ${String(band.y0).padStart(4)}  ${String(band.pct).padStart(5)}%  ${bar}`)
}
