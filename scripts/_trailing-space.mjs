// How much of each page is nothing.
//
// A fullPage screenshot is as tall as the document, so dead space at the bottom
// is scored against live content by compare.mjs and reads as a design gap. This
// prints, per route, the document height, the bottom of the lowest element that
// actually paints, and the difference.
import { chromium } from '@playwright/test'

const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const ROUTES = process.env.TRAILING_ROUTES?.split(',') ?? [
  '/',
  '/products',
  '/cart',
  '/checkout',
  '/search?q=cafe',
  '/coupons',
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
console.log('  docH  paintedTo   dead  route')
for (const route of ROUTES) {
  const p = await ctx.newPage()
  try {
    await p.goto(`${LOCAL}${route}`, { waitUntil: 'networkidle', timeout: 60000 })
    await p.waitForTimeout(800)
    const r = await p.evaluate(() => {
      const docH = document.documentElement.scrollHeight
      let painted = 0
      let owner = ''
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue
        const box = el.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) continue
        const bottom = box.bottom + window.scrollY
        if (bottom > painted) {
          painted = bottom
          owner = `${el.tagName}.${(el.className ?? '').toString().slice(0, 24)}`
        }
      }
      return { docH, painted: Math.round(painted), owner, url: location.pathname }
    })
    // `r.url` is location.pathname AFTER any redirect. /checkout sends an
    // empty cart to /cart and this probe seeds nothing, so the checkout line
    // measures the cart. The value was already being collected and never
    // compared; two sibling tools published the wrong page under the right
    // name before this line existed.
    const finalPath = r.url
    const requestedPath = route.split('?')[0]
    const suffix =
      finalPath === requestedPath ? '' : `   <- MEASURED ${finalPath}, NOT ${requestedPath}`
    console.log(
      `${String(r.docH).padStart(6)} ${String(r.painted).padStart(10)} ${String(r.docH - r.painted).padStart(6)}  ${route}  ${r.owner}${suffix}`,
    )
  } catch (error) {
    console.log(`  ERR ${route}: ${String(error.message).split('\n')[0]}`)
  }
  await p.close()
}
await browser.close()
