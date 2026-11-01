import { chromium } from '@playwright/test'
const [base, ...paths] = process.argv.slice(2)
const browser = await chromium.launch()
let total = 0
const offsets = {
  '+0': 0,
  '+3h': 3 * 3600e3,
  '+1d': 86400e3,
  '+3d': 3 * 86400e3,
  '+5d(fri)': 4 * 86400e3 + 10 * 3600e3,
}
for (const p of paths)
  for (const [name, off] of Object.entries(offsets))
    for (const tz of ['Asia/Jerusalem', 'UTC', 'America/Los_Angeles']) {
      const ctx = await browser.newContext({ timezoneId: tz, locale: 'he-IL' })
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date(Date.now() + off) })
      await page.clock.resume?.()
      const errs = []
      page.on('console', (m) => {
        if (m.type() === 'error') errs.push(m.text())
      })
      page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
      await page.goto(base + p, { waitUntil: 'load', timeout: 60000 })
      await page.waitForTimeout(3000)
      if (errs.length) {
        console.log(`!! ${p} ${name} ${tz}`)
        for (const e of errs) console.log(`   ${e.slice(0, 300)}`)
      }
      total += errs.length
      await ctx.close()
    }
await browser.close()
console.log(`TOTAL_ERRORS=${total}`)
