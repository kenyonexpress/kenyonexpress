import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
const VIEW = { width: 1440, height: 2000 }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
const live = await ctx.newPage()
try {
  await live.goto(pathToFileURL(resolve('refs/ke_live_product.html')).href, {
    waitUntil: 'networkidle',
    timeout: 45000,
  })
} catch {}
await live.waitForTimeout(3000)
await live.screenshot({ path: 'refs/live-product.png', fullPage: true })
console.log('live-product.png written')
const mine = await ctx.newPage()
const slug = encodeURIComponent('מוצר-לדוגמא')
await mine.goto(`http://localhost:3000/product/${slug}`, { waitUntil: 'networkidle' })
await mine.waitForTimeout(1200)
await mine.screenshot({ path: 'refs/mine-product.png', fullPage: true })
console.log('mine-product.png written')
await b.close()
