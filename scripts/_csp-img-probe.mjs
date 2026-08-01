import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Proof, not inference, for the claim that the catalog's picsum thumbnails were
// blocked rather than merely slow.
//
// Loads a real page so the app's own CSP header governs the document, then asks
// for the SAME picsum URL twice: once directly, once through /_next/image. The
// console listener is the point - a blocked image and a 404 both surface as an
// error event on the element, and only the console line says which.
//
// Result on the build that shipped the raw <img>:
//   [console:error] Loading the image 'https://picsum.photos/...' violates the
//   following Content Security Policy directive: "img-src 'self' data: blob: ..."
//   {"rawPicsum":"ERROR","optimized":"OK 384x384"}

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3213'
const REMOTE = 'https://picsum.photos/seed/demo-coupon-1/600/600'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => console.log(`[console:${m.type()}] ${m.text().slice(0, 220)}`))
await page.goto(`${BASE}/products`, { waitUntil: 'load', timeout: 60_000 })

const result = await page.evaluate(async (remote) => {
  const load = (src) =>
    new Promise((res) => {
      const img = new Image()
      img.onload = () => res(`OK ${img.naturalWidth}x${img.naturalHeight}`)
      img.onerror = () => res('ERROR')
      img.src = src
      setTimeout(() => res('TIMEOUT'), 8000)
    })

  return {
    rawPicsum: await load(remote),
    optimized: await load(`/_next/image?url=${encodeURIComponent(remote)}&w=384&q=75`),
  }
}, REMOTE)

console.log(JSON.stringify(result))
await browser.close()
