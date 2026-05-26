import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.screenshot({ path: '/tmp/kenyon-home.png', fullPage: true })

const section = page.locator('section[dir="rtl"]').first()
const box = await section.boundingBox()
console.log('section box:', JSON.stringify(box))
await section.screenshot({ path: '/tmp/kenyon-section.png' })

await browser.close()
