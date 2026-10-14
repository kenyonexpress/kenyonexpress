// UX12: which requests keep a script-off Pixel 5 page from firing `load`.
import { chromium, devices } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Pixel 5'], javaScriptEnabled: false })
const page = await ctx.newPage()
const pending = new Map()
page.on('request', (r) => pending.set(r.url(), Date.now()))
page.on('requestfinished', (r) => pending.delete(r.url()))
page.on('requestfailed', (r) => pending.delete(r.url()))
const started = Date.now()
const result = await page
  .goto('http://localhost:3346/', { waitUntil: 'load', timeout: 12000 })
  .then(() => 'load fired')
  .catch((e) => `no load: ${e.message.split('\n')[0]}`)
console.log(result, 'after', Date.now() - started, 'ms')
console.log(
  'still pending:',
  [...pending.keys()].map((u) => u.replace('http://localhost:3346', '')),
)
await browser.close()
