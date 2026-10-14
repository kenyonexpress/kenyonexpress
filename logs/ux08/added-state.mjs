// UX08: capture the CTA's confirmation state after the server accepted the
// add (data-added), at 1440, for the record beside after-1440.png.
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
await ctx.addInitScript(() => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
})
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const section = page.locator('section[aria-labelledby="deal-of-the-day-title"]')
await section.scrollIntoViewIfNeeded()
const cta = section.getByRole('button', { name: 'הוסף לעגלה' })
const before = await cta.evaluate((el) => {
  const s = getComputedStyle(el)
  return { bg: s.backgroundColor, color: s.color, animation: s.animationName }
})
await cta.click()
const added = section.locator('button[data-added]')
await added.waitFor({ timeout: 15000 })
const after = await added.evaluate((el) => {
  const s = getComputedStyle(el)
  const svg = el.querySelector('svg')
  return {
    bg: s.backgroundColor,
    color: s.color,
    animation: s.animationName,
    duration: s.animationDuration,
    text: el.textContent?.trim(),
    check: svg ? getComputedStyle(svg).animationName : null,
  }
})
const drawer = await page.locator('dialog.cart-drawer[open]').count()
const clip = await section.boundingBox()
await page.screenshot({
  path: 'logs/ux08/after-1440-added.png',
  clip: { x: 0, y: Math.max(0, clip.y - 10), width: 1440, height: Math.min(clip.height + 20, 880) },
})
await page.waitForTimeout(2200)
const reverted = await section.locator('button[data-added]').count()
const out = { before, after, drawerOpen: drawer, revertedAfter2200ms: reverted === 0 }
writeFileSync('logs/ux08/added-state.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1))
await browser.close()
