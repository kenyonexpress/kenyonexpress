// Cumulative Layout Shift, with the element that moved.
//
// Lighthouse reports one number and attributes it to whatever element happened
// to be at the bottom of the shifted subtree, which on this site is always
// `<footer>`. That names the symptom. This reads the raw `layout-shift` entries
// and prints each one with its sources, so a fix can be aimed.
//
//   LOCAL_BASE=http://localhost:3313 node scripts/_cls-probe.mjs /search?q=barbecue
import { chromium } from '@playwright/test'

const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'
const routes = process.argv.slice(2)
if (routes.length === 0) routes.push('/')
// Three runs, because a single streaming page is not deterministic: the shift
// depends on when the boundary resolves relative to paint.
const RUNS = Number(process.env.CLS_RUNS ?? 3)

const browser = await chromium.launch()
for (const route of routes) {
  const totals = []
  let last = null
  for (let run = 0; run < RUNS; run++) {
    // A fresh context per run: a warm HTTP cache resolves the boundary before
    // first paint and hides the shift the first visitor actually gets.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    await p.addInitScript(() => {
      window.__shifts = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue
          window.__shifts.push({
            value: entry.value,
            time: Math.round(entry.startTime),
            sources: (entry.sources ?? []).map((s) => {
              const el = s.node
              if (!el || !el.tagName) return '(detached)'
              return `${el.tagName.toLowerCase()}.${(el.className ?? '').toString().slice(0, 28)}`
            }),
          })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await p.goto(`${LOCAL}${route}`, { waitUntil: 'networkidle', timeout: 60000 })
    await p.waitForTimeout(3000)
    const shifts = await p.evaluate(() => window.__shifts)
    totals.push(shifts.reduce((a, s) => a + s.value, 0))
    last = shifts
    await ctx.close()
  }
  console.log(`\n=== ${route} ===`)
  console.log(`CLS over ${RUNS} runs: ${totals.map((t) => t.toFixed(3)).join(', ')}`)
  console.log('last run, shifts over 0.001:')
  for (const s of last.filter((s) => s.value > 0.001)) {
    console.log(`  ${s.value.toFixed(4)}  @${s.time}ms  ${s.sources.join(' | ')}`)
  }
}
await browser.close()
