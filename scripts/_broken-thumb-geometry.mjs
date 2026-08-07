import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Isolates what a BROKEN catalog thumbnail costs in layout, without needing the
// old build to compare against.
//
// Before the card went through the optimizer, every picsum.photos thumb was
// blocked by the CSP and rendered as Chrome's broken-image box - which is sized
// by the alt text, not by the 186 square the CSS reserves. That is a layout
// difference, not only a missing picture, and it is the reason the /products and
// /category pixel gates moved when the images started rendering.
//
// Reproduced here on the CURRENT build by aborting the optimizer requests for
// exactly those URLs, so both states are measured on one binary.

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3213'
const path = process.argv.find((a) => a.startsWith('--path='))?.slice(7) ?? '/products'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const browser = await chromium.launch()

for (const blockRemote of [true, false]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  if (blockRemote) {
    await page.route('**/_next/image**', (route) => {
      const url = new URL(route.request().url())
      const inner = decodeURIComponent(url.searchParams.get('url') ?? '')
      if (/^https?:/.test(inner)) return route.abort()
      return route.continue()
    })
  }
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60_000 })
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(2500)

  const geo = await page.evaluate(() => {
    const thumbs = [...document.querySelectorAll('.category-card__thumb img')]
    const boxes = thumbs.map((el) => {
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    })
    return {
      docHeight: document.documentElement.scrollHeight,
      thumbs: boxes.length,
      full: boxes.filter((b) => b.w >= 180 && b.h >= 120).length,
      shrunken: boxes.filter((b) => b.w < 180 && b.h < 180).length,
      firstRowTop: Math.round(
        (document.querySelector('.category-card')?.getBoundingClientRect().top ?? 0) +
          window.scrollY,
      ),
    }
  })

  console.log(
    `${blockRemote ? 'remote thumbs blocked (the old state)' : 'thumbs rendering (now)      '}  ` +
      `docHeight ${geo.docHeight}  thumbs ${geo.thumbs}  full-size ${geo.full}  shrunken ${geo.shrunken}`,
  )
  await context.close()
}

await browser.close()
