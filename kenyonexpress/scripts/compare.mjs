import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const VIEW = { width: 1440, height: 2600 }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })

// 1) live (saved HTML; absolute asset URLs load over network)
const live = await ctx.newPage()
const fileUrl = pathToFileURL(resolve('refs/ke_live_home.html')).href
try {
  await live.goto(fileUrl, { waitUntil: 'networkidle', timeout: 45000 })
} catch { /* networkidle may time out on heavy pages */ }
await live.waitForTimeout(3000)
await live.screenshot({ path: 'refs/live.png', fullPage: true })
console.log('live.png written')

// 2) mine
const mine = await ctx.newPage()
await mine.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await mine.waitForTimeout(1500)
await mine.screenshot({ path: 'refs/mine.png', fullPage: true })
console.log('mine.png written')

await b.close()
