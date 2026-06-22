import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const VIEW = { width: 1440, height: 2600 }
const LIVE_HTML = resolve('refs/ke_live_singlefile.html')

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1 })

const live = await ctx.newPage()
const fileUrl = pathToFileURL(LIVE_HTML).href
try {
  await live.goto(fileUrl, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await live.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await live.waitForTimeout(4000)
await live.screenshot({ path: 'refs/live.png', fullPage: true })
console.log('live.png written')

const mine = await ctx.newPage()
await mine.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await mine.waitForTimeout(2000)
await mine.screenshot({ path: 'refs/mine.png', fullPage: true })
console.log('mine.png written')

await b.close()
