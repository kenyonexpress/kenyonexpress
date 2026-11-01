import { chromium } from '@playwright/test'
const base = process.argv[2] || 'http://localhost:3133'
const paths = process.argv.slice(3)
const browser = await chromium.launch()
let total = 0
for (const p of paths) {
  for (const tz of ['Asia/Jerusalem', 'America/New_York']) {
    const ctx = await browser.newContext({
      timezoneId: tz,
      locale: tz === 'Asia/Jerusalem' ? 'he-IL' : 'en-US',
    })
    const page = await ctx.newPage()
    const errs = []
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push(`console.error: ${m.text()}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 400) errs.push(`resp ${r.status()} ${r.url()}`)
    })
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
    await page.goto(base + p, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(2500)
    console.log(`== ${p} [${tz}] errors=${errs.length}`)
    for (const e of errs) console.log(`  ${e.slice(0, 600)}`)
    total += errs.length
    await ctx.close()
  }
}
await browser.close()
console.log(`TOTAL_ERRORS=${total}`)
