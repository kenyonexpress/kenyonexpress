import { chromium, devices } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3351'
const PATH = process.env.PRODUCT ?? '/product/צימר-מאסטר'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Desktop Chrome'], locale: 'he-IL' })
await ctx.addInitScript(() => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
})
const page = await ctx.newPage()
await page.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const frame = page.locator('.pdp-gallery__frame')
const box = await frame.boundingBox()
console.log('box', box, 'viewport', page.viewportSize())
const x = box.x + box.width * 0.25
const y = box.y + box.height * 0.75
const under = await page.evaluate(
  ([x, y]) => {
    const el = document.elementFromPoint(x, y)
    return el
      ? `${el.tagName}.${el.className} ${el.closest('.pdp-gallery__frame') ? 'in-frame' : 'OUTSIDE'}`
      : null
  },
  [x, y],
)
console.log('elementFromPoint', under)
await page.mouse.move(x, y)
await page.mouse.move(x + 1, y)
await page.waitForTimeout(300)
console.log(
  'after move',
  await frame.getAttribute('data-zoomed'),
  await frame.getAttribute('data-zoom-mode'),
)
// dispatch a synthetic pointermove with pointerType mouse directly
const synthetic = await frame.evaluate(
  (el, [x, y]) => {
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
      }),
    )
    return el.getAttribute('data-zoomed')
  },
  [x, y],
)
console.log('after synthetic', synthetic)
await page.screenshot({ path: 'logs/ux15/hover-debug.png' })
await browser.close()
