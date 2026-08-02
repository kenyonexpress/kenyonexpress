// Crop the same y-range out of refs/live.png and refs/mine.png and write them
// side by side (or stacked), so a band number from diff-bands.mjs can be looked
// at directly. Usage: node scripts/crop-band.mjs <y0> <y1> [outName] [scale]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const y0 = Number(process.argv[2] ?? 0)
const y1 = Number(process.argv[3] ?? y0 + 100)
const out = process.argv[4] ?? `band-${y0}-${y1}`
const scale = Number(process.argv[5] ?? 1)

const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`

const b = await chromium.launch()
const page = await b.newPage()
await page.goto('about:blank')

const b64 = await page.evaluate(
  async ({ liveUrl, mineUrl, y0, y1, scale }) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = rej
        img.src = src
      })
    const [live, mine] = await Promise.all([load(liveUrl), load(mineUrl)])
    const w = Math.min(live.width, mine.width)
    const h = y1 - y0
    const dw = Math.round(w * scale)
    const dh = Math.round(h * scale)
    const LABEL = 18
    // Side by side keeps the two columns comparable at a glance; each panel keeps
    // its own x origin so element positions can be read off directly.
    const c = document.createElement('canvas')
    c.width = dw * 2 + 8
    c.height = dh + LABEL
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(live, 0, y0, w, h, 0, LABEL, dw, dh)
    ctx.drawImage(mine, 0, y0, w, h, dw + 8, LABEL, dw, dh)
    ctx.fillStyle = '#000'
    ctx.font = '13px monospace'
    ctx.fillText(`LIVE y${y0}-${y1}`, 6, 13)
    ctx.fillText(`MINE y${y0}-${y1}`, dw + 14, 13)
    ctx.strokeStyle = '#f0f'
    ctx.beginPath()
    ctx.moveTo(dw + 4, 0)
    ctx.lineTo(dw + 4, c.height)
    ctx.stroke()
    return c.toDataURL('image/png').split(',')[1]
  },
  { liveUrl: toDataUrl('refs/live.png'), mineUrl: toDataUrl('refs/mine.png'), y0, y1, scale },
)

writeFileSync(`refs/${out}.png`, Buffer.from(b64, 'base64'))
console.log(`refs/${out}.png written`)
await b.close()
