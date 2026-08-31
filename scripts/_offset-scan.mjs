#!/usr/bin/env node
/**
 * How much of a page's pixel difference is one vertical offset?
 *
 * Slides `mine` down by k pixels against `live` and reports the same overall
 * mismatch diff-bands.mjs computes, for every k in a range. A page whose diff
 * collapses at k=17 is not 16% different in its design: it is the same design
 * pushed 17px up the screen, and 17px is what the live product template's
 * masthead is taller than ours.
 *
 * Usage: node scripts/_offset-scan.mjs refs/live-product.png refs/mine-product.png [maxShift]
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const livePath = process.argv[2] ?? 'refs/live.png'
const minePath = process.argv[3] ?? 'refs/mine.png'
const maxShift = Number(process.argv[4] ?? 40)
const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`

const b = await chromium.launch()
const page = await b.newPage()
await page.goto('about:blank')
const rows = await page.evaluate(
  async ({ liveUrl, mineUrl, maxShift }) => {
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
    const grab = (img, dy) => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, dy)
      return ctx.getImageData(0, 0, W, H).data
    }
    const a = grab(live, 0)
    const TOL = 24
    const out = []
    for (let k = 0; k <= maxShift; k++) {
      const m = grab(mine, k)
      let diff = 0
      // The band the shift itself blanks out is excluded, so a shift cannot
      // score better by painting white over the top of the page.
      for (let y = k; y < H; y++) {
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
      out.push({ k, pct: (diff / (W * (H - k))) * 100 })
    }
    return out
  },
  { liveUrl: toDataUrl(livePath), mineUrl: toDataUrl(minePath), maxShift },
)
await b.close()

const best = rows.reduce((a, z) => (z.pct < a.pct ? z : a))
for (const r of rows) {
  const bar = '#'.repeat(Math.round(r.pct))
  console.log(
    `${String(r.k).padStart(3)}px  ${r.pct.toFixed(2).padStart(6)}%  ${bar}${r.k === best.k ? '  <= best' : ''}`,
  )
}
