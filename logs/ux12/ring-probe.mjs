// UX12: what the footer field's ring resolves to at 1440 in each state.
import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
})
const page = await ctx.newPage()
await page.goto('http://localhost:3346/', { waitUntil: 'networkidle' })
const input = page.locator('footer input[type="email"]')
await input.scrollIntoViewIfNeeded()
const read = (label) =>
  input.evaluate((el, label) => {
    const s = getComputedStyle(el)
    return {
      label,
      shadow: s.boxShadow,
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      invalid: el.getAttribute('aria-invalid'),
      focused: document.activeElement === el,
      ringColor: s.getPropertyValue('--tw-ring-color'),
    }
  }, label)
console.log(await read('idle'))
await input.focus()
console.log(await read('focused'))
await page.locator('footer button[type="submit"]').click()
await page.waitForTimeout(300)
console.log(await read('invalid+focused'))
await page.locator('footer h2').click()
await page.waitForTimeout(200)
console.log(await read('invalid, blurred'))
await browser.close()
