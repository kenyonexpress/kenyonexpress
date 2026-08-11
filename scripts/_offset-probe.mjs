// Throwaway probe: what would the band diff be if our side started N pixels
// lower? Answers "is the 17px masthead gap worth a code change" without making
// the code change first. Usage:
//   node scripts/_offset-probe.mjs <page> <offset,offset,...>
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const page = process.argv[2] ?? 'search'
const offsets = (process.argv[3] ?? '0,17').split(',').map(Number)
const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`
const liveUrl = toDataUrl(`refs/live-${page}.png`)
const mineUrl = toDataUrl(`refs/mine-${page}.png`)

const b = await chromium.launch()
const p = await b.newPage()
await p.goto('about:blank')
const out = await p.evaluate(
  async ({ liveUrl, mineUrl, offsets }) => {
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
    const data = (img, dy) => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, dy)
      return ctx.getImageData(0, 0, W, H).data
    }
    const a = data(live, 0)
    const results = []
    for (const dy of offsets) {
      const m = data(mine, dy)
      const TOL = 24
      let diff = 0
      // Skip the band the shift itself blanks, so the answer is about the page
      // and not about the empty strip a translation leaves behind.
      const y0 = Math.max(0, dy)
      for (let y = y0; y < H; y++) {
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
      results.push({ dy, pct: +((100 * diff) / (W * (H - y0))).toFixed(2) })
    }
    return { W, H, results }
  },
  { liveUrl, mineUrl, offsets },
)
await b.close()
console.log(`${page}: compared ${out.W}x${out.H}`)
for (const r of out.results) console.log(`  shift mine +${String(r.dy).padStart(3)}px -> ${r.pct}%`)
