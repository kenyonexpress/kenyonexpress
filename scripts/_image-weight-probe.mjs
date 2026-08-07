import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Usage:
//   node scripts/_image-weight-probe.mjs [--path=/] [--width=412] [--dpr=1.75] [--wait=6000]
//
// One question only: for every image the page actually downloads, how many
// bytes came down and how many CSS pixels did it paint into. Those two numbers
// next to each other are what [16] and [17] were each missing one half of -
// [16] counted bytes and could not see a 1x1 slide, [17] measured boxes and
// could not see the wasted download.
//
// Bytes are read off the response body, not off content-length: the optimizer
// answers /_next/image without one on a streamed response, and a missing header
// silently scores as zero.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3213'
const path = argOf('path', '/')
const width = Number(argOf('width', '412'))
const height = Number(argOf('height', '823'))
const dpr = Number(argOf('dpr', '1.75'))
const wait = Number(argOf('wait', '6000'))

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
  isMobile: width < 1024,
  hasTouch: width < 1024,
  userAgent: width < 1024 ? IPHONE_UA : undefined,
})
const page = await context.newPage()

/** url -> bytes. Keyed by url so a repeated request is counted once, which is
 *  what the browser cache does anyway. */
const bytes = new Map()

page.on('response', async (response) => {
  const request = response.request()
  if (request.resourceType() !== 'image') return
  try {
    const body = await response.body()
    bytes.set(response.url(), body.length)
  } catch {
    // A redirect or an aborted request has no body to read. Left out rather
    // than recorded as 0, so the total never quietly under-reports.
  }
})

await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60_000 })
// Scroll the whole page so lazy images below the fold are requested too:
// a weight number that only counts the first screen is not the page's weight.
await page.evaluate(async () => {
  const step = window.innerHeight
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 120))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(wait)

const painted = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('img')) {
    const r = el.getBoundingClientRect()
    out.push({
      current: el.currentSrc || el.src,
      w: Math.round(r.width),
      h: Math.round(r.height),
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      sizes: el.sizes || '',
      loading: el.loading,
      cls: el.className?.toString().slice(0, 40) ?? '',
    })
  }
  return out
})

const short = (url) => {
  try {
    const u = new URL(url)
    if (u.pathname === '/_next/image') {
      const inner = u.searchParams.get('url') ?? ''
      return `opt(w=${u.searchParams.get('w')},q=${u.searchParams.get('q')}) ${decodeURIComponent(inner).slice(-46)}`
    }
    return `RAW ${u.pathname.slice(-56)}`
  } catch {
    return url.slice(0, 60)
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)}KB`

const rows = painted.map((p) => ({
  ...p,
  bytes: bytes.get(p.current) ?? null,
  optimized: p.current.includes('/_next/image'),
}))

console.log(`=== ${BASE}${path} @ ${width}x${height} dpr${dpr} ===`)
console.log(`images in DOM: ${rows.length}  image responses: ${bytes.size}`)

let total = 0
for (const b of bytes.values()) total += b
console.log(`total image bytes: ${kb(total)}`)

const rawTotal = rows
  .filter((r) => !r.optimized && r.bytes)
  .reduce((sum, r) => sum + (r.bytes ?? 0), 0)
console.log(`of which NOT through /_next/image: ${kb(rawTotal)}`)

const zero = rows.filter((r) => r.h === 0 || r.w === 0)
console.log(`painted into a zero box: ${zero.length}`)

console.log('\npainted   natural    bytes    src')
for (const r of rows.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))) {
  const paintedStr = `${r.w}x${r.h}`.padEnd(9)
  const natStr = `${r.naturalWidth}x${r.naturalHeight}`.padEnd(10)
  const byteStr = (r.bytes == null ? '-' : kb(r.bytes)).padStart(8)
  console.log(`${paintedStr} ${natStr} ${byteStr}  ${short(r.current)}`)
}

const orphans = [...bytes.entries()].filter(([url]) => !rows.some((r) => r.current === url))
if (orphans.length) {
  console.log('\ndownloaded but not the currentSrc of any <img> (css/preload/swapped):')
  for (const [url, size] of orphans.sort((a, b) => b[1] - a[1])) {
    console.log(`${kb(size).padStart(8)}  ${short(url)}`)
  }
}

await browser.close()
