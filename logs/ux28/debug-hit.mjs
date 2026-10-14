import { chromium } from '@playwright/test'
const BASE = 'http://localhost:3364'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: 'ke_consent', value: 'denied.2', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
await page.goto(`${BASE}/products`, { waitUntil: 'networkidle' })
await page.locator('button[aria-label="הוסף להשוואה"]').first().click({ force: true })
await page.locator('[data-sonner-toast]').first().waitFor()
await page.waitForTimeout(900)
const info = await page.evaluate(() => {
  const close = document.querySelector('[data-sonner-toast] [data-close-button]')
  const b = close.getBoundingClientRect()
  const after = getComputedStyle(close, '::after')
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const grid = []
  for (const dy of [-21, -14, -7, 0, 7, 14, 21]) {
    const row = []
    for (const dx of [-21, -14, -7, 0, 7, 14, 21]) {
      const el = document.elementFromPoint(cx + dx, cy + dy)
      row.push(
        !el
          ? '.'
          : el === close || close.contains(el)
            ? 'X'
            : el.getAttribute('data-sonner-toast') !== null
              ? 't'
              : el.tagName[0].toLowerCase(),
      )
    }
    grid.push(row.join(''))
  }
  const toast = close.closest('[data-sonner-toast]')
  return {
    rect: b.toJSON(),
    position: getComputedStyle(close).position,
    overflow: getComputedStyle(toast).overflow,
    after: {
      content: after.content,
      position: after.position,
      inset: after.inset,
      width: after.width,
      height: after.height,
    },
    liZ: getComputedStyle(toast).zIndex,
    btnZ: getComputedStyle(close).zIndex,
    toastRect: toast.getBoundingClientRect().toJSON(),
    grid,
    hitAtRight: (() => {
      const el = document.elementFromPoint(cx + 21, cy)
      return el
        ? `${el.tagName}.${(el.className || '').toString().slice(0, 40)} ${el.getAttribute('data-content') !== null ? 'content' : ''}`
        : null
    })(),
    hitAtBottom: (() => {
      const el = document.elementFromPoint(cx, cy + 21)
      return el
        ? `${el.tagName} ${[...el.attributes]
            .map((a) => a.name)
            .join(',')
            .slice(0, 80)}`
        : null
    })(),
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
