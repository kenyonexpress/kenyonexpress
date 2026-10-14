// UX05 probe: the hero carousel before/after. Four questions, read off the
// rendered page at 380 (Pixel-ish touch context) and 1440:
//   swipe     does a 120px horizontal touch swipe change the slide?
//   progress  is there an autoplay progress indicator on the current dot?
//   lazy      how many slides have their media mounted before and after the
//             visitor engages? (live data has no photographs, so "media" is the
//             branded placeholder, one per mounted slide box)
//   status    is there a text status "slide N of M" for assistive tech?
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3345'
const browser = await chromium.launch()
const out = {}

const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}

const read = async (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-hero-slider]')
    const slides = [...root.querySelectorAll(':scope > [aria-hidden]')]
    const current = root.querySelector('button[aria-current="true"]')
    const fill = current?.querySelector('[data-hero-progress]')
    const status = root.querySelector('[data-hero-status]')
    return {
      activeDot: current?.getAttribute('aria-label') ?? null,
      slides: slides.length,
      mounted: slides.filter((s) => s.querySelector('[data-awaiting-photography], img')).length,
      progress: fill
        ? {
            state: fill.getAttribute('data-hero-progress'),
            animation: getComputedStyle(fill).animationName,
            duration: getComputedStyle(fill).animationDuration,
            transform: getComputedStyle(fill).transform,
          }
        : null,
      status: status ? { text: status.textContent, live: status.getAttribute('aria-live') } : null,
      touchAction: getComputedStyle(root).touchAction,
    }
  })

async function swipe(page, { x0, x1, y }) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 8
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

for (const width of [380, 1440]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: width < 1024,
  })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('[data-hero-slider]').waitFor()
  await page.waitForTimeout(800)
  const r = { width }
  r.atRest = await read(page)
  const box = await page.locator('[data-hero-slider]').boundingBox()
  const y = box.y + box.height / 2
  // RTL: next is to the left, so the finger moves RIGHT to pull it in.
  await swipe(page, { x0: box.x + box.width * 0.3, x1: box.x + box.width * 0.3 + 120, y })
  await page.waitForTimeout(300)
  r.afterSwipeRight = await read(page)
  await swipe(page, { x0: box.x + box.width * 0.7, x1: box.x + box.width * 0.7 - 120, y })
  await page.waitForTimeout(300)
  r.afterSwipeLeft = await read(page)
  // A short drag must not move it.
  await swipe(page, { x0: box.x + box.width * 0.5, x1: box.x + box.width * 0.5 + 30, y })
  await page.waitForTimeout(300)
  r.afterShortDrag = await read(page)
  // Leave the pointer outside the slider so the hover pause is not holding it.
  await page.mouse.move(5, 5)
  await page.waitForTimeout(5600)
  r.after5600ms = await read(page)
  await page.screenshot({
    path: `logs/ux05/${process.env.TAG ?? 'shot'}-${width}.png`,
    clip: { x: 0, y: 0, width, height: 700 },
  })
  out[width] = r
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 2))
