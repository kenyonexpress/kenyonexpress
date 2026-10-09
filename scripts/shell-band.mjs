// Shell-only pixel diff, in the row range you name.
//
// WHY THIS EXISTS. scripts/diff-bands.mjs reports in fixed 100px bands over the
// first 2600px. That is the right shape for a page, and the wrong shape for the
// app shell: live's header ends at 122px at 768 and 197px at 380, so the band
// that contains it is mostly the page content underneath, and a shell that
// matches perfectly still reads as a double-digit band. There was no way to
// answer "is the shell under 11%" from that output at all.
//
// Same metric as diff-bands.mjs -- per-channel tolerance 24, a pixel counts as
// different if any of R/G/B exceeds it -- so the numbers are comparable. The
// only differences are the row window and a per-row breakdown, which says WHERE
// in the shell the mismatch is rather than that there is one.
//
// Usage, after a compare.mjs run has left refs/live-home.png and
// refs/mine-home.png (compare.mjs writes those on every run):
//
//   LIVE_PNG=refs/live-home.png MINE_PNG=refs/mine-home.png \
//     Y0=0 Y1=197 node scripts/shell-band.mjs
//
// The shell heights are measured, not guessed; refs/ke_live_computed.json gives
// top bar + header as 113+84 at 380, 38+84 at 768 and 38+110 at 1440.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}
const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`
const liveUrl = toDataUrl(process.env.LIVE_PNG)
const mineUrl = toDataUrl(process.env.MINE_PNG)
const Y0 = Number(process.env.Y0 ?? 0)
const Y1 = Number(process.env.Y1 ?? 200)

const b = await chromium.launch()
const page = await b.newPage()
await page.goto('about:blank')
const out = await page.evaluate(
  async ({ liveUrl, mineUrl, Y0, Y1 }) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = rej
        img.src = src
      })
    const [live, mine] = await Promise.all([load(liveUrl), load(mineUrl)])
    const W = Math.min(live.width, mine.width)
    const H = Math.min(live.height, mine.height, Y1)
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
    const TOL = 24
    let diff = 0
    const rows = []
    for (let y = Y0; y < H; y++) {
      let rowDiff = 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        if (
          Math.abs(a[i] - m[i]) > TOL ||
          Math.abs(a[i + 1] - m[i + 1]) > TOL ||
          Math.abs(a[i + 2] - m[i + 2]) > TOL
        ) {
          diff++
          rowDiff++
        }
      }
      rows.push(+((100 * rowDiff) / W).toFixed(1))
    }
    const n = (H - Y0) * W
    return { W, H, pct: +((100 * diff) / n).toFixed(2), rows }
  },
  { liveUrl, mineUrl, Y0, Y1 },
)
await b.close()
console.log(`SHELL y${Y0}..${out.H} @${out.W}px : ${out.pct}%`)
const worst = out.rows
  .map((p, i) => [i + Y0, p])
  .sort((x, y) => y[1] - x[1])
  .slice(0, 6)
console.log('worst rows:', worst.map(([y, p]) => `y${y}=${p}%`).join('  '))
