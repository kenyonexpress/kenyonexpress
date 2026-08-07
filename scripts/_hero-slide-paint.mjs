import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// What each hero slide image ACTUALLY paints, at five handheld widths.
//
// The box is full-bleed and `object-contain`, so the box width is not the
// painted width: the frames are near-square inside a 177px-tall box, so HEIGHT
// is the constraint and the painted width is `boxHeight * aspect`. That is the
// number `sizes` has to state, and it is the number nobody measured for the four
// non-animated slides - they inherited the animated one's 100vw.

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3213'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const browser = await chromium.launch()

for (const width of [320, 360, 390, 412, 768, 1023]) {
  const context = await browser.newContext({
    viewport: { width, height: 823 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForTimeout(2500)

  const slides = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('img')) {
      const url = el.currentSrc || el.src
      if (!/hero%2Fslider|hero\/slider/.test(url)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      const aspect = el.naturalWidth / el.naturalHeight
      const painted = Math.min(r.width, r.height * aspect)
      out.push({
        src: (el.currentSrc || el.src).split('/').pop()?.slice(0, 34),
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        paintedW: Math.round(painted),
        sizes: el.sizes,
      })
    }
    return out
  })

  console.log(`\n=== viewport ${width} ===`)
  for (const s of slides) {
    console.log(
      `box ${s.box.padEnd(9)} painted ${String(s.paintedW).padStart(4)}px  sizes="${s.sizes}"  ${s.src}`,
    )
  }
  await context.close()
}

await browser.close()
