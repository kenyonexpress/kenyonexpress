import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3455'
const routes = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// Lighthouse's own stated mobile conditions. A shift caused by an image or a
// font landing after first paint does not reproduce on an unthrottled laptop.
const throttle = process.argv.includes('--throttle')
const b = await chromium.launch()
for (const route of routes) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75 })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    window.__shifts = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue
        window.__shifts.push({
          value: e.value,
          t: Math.round(e.startTime),
          sources: (e.sources || []).map((s) => ({
            tag: s.node?.tagName?.toLowerCase(),
            cls: (typeof s.node?.className === 'string' ? s.node.className : '').slice(0, 60),
            id: s.node?.id,
            from: [Math.round(s.previousRect.top), Math.round(s.previousRect.height)],
            to: [Math.round(s.currentRect.top), Math.round(s.currentRect.height)],
          })),
        })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  if (throttle) {
    const cdp = await ctx.newCDPSession(p)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
  }
  await p.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await p.waitForTimeout(throttle ? 9000 : 3500)
  const shifts = await p.evaluate(() => window.__shifts)
  const total = shifts.reduce((a, s) => a + s.value, 0)
  console.log(`\n=== ${route} CLS ${total.toFixed(3)} (${shifts.length} shifts) ===`)
  for (const s of shifts.sort((a, z) => z.value - a.value).slice(0, 4)) {
    console.log(` ${s.value.toFixed(3)} at ${s.t}ms`)
    for (const src of s.sources.slice(0, 4))
      console.log(
        `   <${src.tag} class="${src.cls}" id="${src.id ?? ''}"> top ${src.from[0]}->${src.to[0]} h ${src.from[1]}->${src.to[1]}`,
      )
  }
  await ctx.close()
}
await b.close()
