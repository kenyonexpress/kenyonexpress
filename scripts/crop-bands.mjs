import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
// Crop the same y-band from refs/live.png and refs/mine.png for side-by-side
// inspection. Usage: node scripts/crop-bands.mjs <y0> <y1> [outPrefix]
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const y0 = Number(process.argv[2] ?? 0)
const y1 = Number(process.argv[3] ?? y0 + 200)
const prefix = process.argv[4] ?? 'refs/crop'

const toDataUrl = (p) => `data:image/png;base64,${readFileSync(resolve(p)).toString('base64')}`

const b = await chromium.launch()
const page = await b.newPage()

for (const [name, src] of [
  ['live', toDataUrl('refs/live.png')],
  ['mine', toDataUrl('refs/mine.png')],
]) {
  const out = await page.evaluate(
    async ({ src, y0, y1 }) => {
      const img = await new Promise((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = rej
        i.src = src
      })
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = y1 - y0
      c.getContext('2d').drawImage(img, 0, -y0)
      return c.toDataURL('image/png')
    },
    { src, y0, y1 },
  )
  const file = `${prefix}-${name}-${y0}-${y1}.png`
  writeFileSync(file, Buffer.from(out.split(',')[1], 'base64'))
  console.log(file)
}
await b.close()
