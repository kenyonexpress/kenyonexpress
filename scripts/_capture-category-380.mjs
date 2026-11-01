// One-shot: screenshot our /category/<slug> at 380 for a shell-band.mjs run.
// The gate (compare.mjs) refuses since 09.09 because the live reference is
// gone; this captures OUR side only, to be banded against the 09-04 archived
// refs/live-category.png. See docs/PARITY-REFERENCE.md.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}
const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3323'
const SLUG = process.env.COMPARE_CATEGORY_SLUG ?? 'hot-deals'
const OUT = process.env.OUT ?? 'refs/mine-category-380.png'

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 380, height: 900 }, deviceScaleFactor: 1 })
let url = `${BASE}/category/${SLUG}`
let res = await page.goto(url, { waitUntil: 'networkidle' })
if (!res || res.status() >= 400) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const href = await page.evaluate(() =>
    document.querySelector('a[href^="/category/"]')?.getAttribute('href'),
  )
  if (!href) throw new Error('no category link found on home page')
  url = `${BASE}${href}`
  console.log(`slug ${SLUG} not local, discovered -> ${url}`)
  res = await page.goto(url, { waitUntil: 'networkidle' })
  if (!res || res.status() >= 400) throw new Error(`category page ${url} -> ${res?.status()}`)
}
await page.waitForTimeout(500)
await page.screenshot({ path: OUT, fullPage: false })
console.log(`captured ${url} -> ${OUT}`)
await b.close()
