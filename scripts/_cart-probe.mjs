import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c
}
// localhost, never 127.0.0.1: a Next 16 server action rejects the cross-origin.
const B = 'http://localhost:3000'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('console', (m) => {
  if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 200))
})

await p.goto(`${B}/products`, { waitUntil: 'commit', timeout: 60000 })
const link = p.locator('a[href*="/product/"]').first()
await link.waitFor({ state: 'attached', timeout: 45000 })
const href = await link.getAttribute('href')
console.log('product:', href)
await p.goto(`${B}${href}`, { waitUntil: 'commit', timeout: 60000 })
const atc = p.locator('.pdp-buy__atc').first()
await atc.waitFor({ state: 'visible', timeout: 45000 })
await atc.click({ timeout: 30000 })
await p.waitForTimeout(6000)

const panel = await p.locator('.mini-cart__panel').count()
const badge = await p
  .locator('[data-mini-cart-trigger]')
  .innerText()
  .catch(() => '?')
console.log('mini-cart panel present after add:', panel, '| trigger text:', JSON.stringify(badge))
await p.screenshot({ path: 'refs/probe-minicart.png' })

await p.goto(`${B}/cart`, { waitUntil: 'commit', timeout: 60000 })
await p.waitForTimeout(4000)
const lines = await p.locator('.cart-line').count()
const empty = await p.locator('.cart-empty').count()
console.log('cart lines:', lines, '| empty panel:', empty)
if (lines) {
  console.log('price text:', await p.locator('.cart-line__price').first().innerText())
  console.log('total text:', await p.locator('.cart-sidebar__total strong').innerText())
  const box = await p.locator('.cart-line__qty-btn').first().boundingBox()
  console.log('qty button box:', box)
  const w = await p.locator('.cart-page').boundingBox()
  console.log('container width:', w?.width)
}
await p.screenshot({ path: 'refs/probe-cart.png', fullPage: true })
await b.close()
