import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// What the 32 homepage deal cards actually paint, per viewport, against what
// their `sizes` declares.
//
// Lighthouse mobile reports 400KiB of oversized images on the homepage and every
// one of the offenders is one of these cards. The card declares 50vw below 640
// and 33vw below 1024; the question this answers is whether it paints that.

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3213'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const browser = await chromium.launch()

for (const [width, dpr] of [
  [320, 2],
  [440, 2],
  [480, 2],
  [500, 2],
  [540, 2],
  [360, 2],
  [412, 1.75],
  [412, 3],
  [575, 2],
  [640, 2],
  [641, 2],
  [768, 2],
  [900, 2],
  [1023, 2],
  [1024, 2],
  [1280, 1],
  [1440, 1],
  [1920, 1],
]) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: dpr,
    isMobile: width < 1024,
    hasTouch: width < 1024,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60_000 })
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 100))
    }
  })
  await page.waitForTimeout(2500)

  const cards = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.p_con__image')) {
      const img = el
      const r = img.getBoundingClientRect()
      if (r.width === 0) continue
      out.push({
        w: Math.round(r.width),
        h: Math.round(r.height),
        picked: Number(new URL(img.currentSrc, location.href).searchParams.get('w')) || 0,
      })
    }
    return out
  })

  if (cards.length === 0) {
    console.log(`${width}@${dpr}x: no deal card images resolved`)
    continue
  }

  const widths = cards.map((c) => c.w)
  const picked = [...new Set(cards.map((c) => c.picked))].sort((a, b) => a - b)
  const max = Math.max(...widths)
  const needed = max * dpr
  console.log(
    `${String(width).padStart(4)}@${dpr}x  painted ${Math.min(...widths)}-${max}px` +
      `  = ${((max / width) * 100).toFixed(1)}vw` +
      `  needs ${Math.round(needed)} device px  browser picked w=${picked.join('/')}` +
      `  (${cards.length} cards)`,
  )
}

await browser.close()
