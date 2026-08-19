import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
const BASE = 'http://localhost:3311'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2000 } })
const p = await ctx.newPage()
p.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)))
p.on('response', (r) => { if (r.request().method() === 'POST') console.log('POST', r.status(), r.url().slice(0,120)) })
await p.goto(`${BASE}/product/demo-physical-1`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(3000)
const info = await p.evaluate(() => {
  const btn = document.querySelector('.pdp-buy__atc')
  return { found: !!btn, disabled: btn?.disabled, text: btn?.textContent.trim() }
})
console.log('BUTTON', info)
await p.click('.pdp-buy__atc')
await p.waitForTimeout(4000)
console.log('AFTER', await p.evaluate(() => document.querySelector('.pdp-buy__atc')?.textContent.trim()))
console.log('COOKIES', (await ctx.cookies()).map((c) => `${c.name}=${c.value.slice(0,12)}`))
await p.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)
console.log('CART TEXT', (await p.evaluate(() => document.body.innerText)).slice(0, 600))
await b.close()
