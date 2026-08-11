import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Usage:
//   node scripts/_lcp-probe.mjs [--url=http://localhost:3211/] [--width=412] [--dpr=1.75]
//                               [--cpu=4] [--consent] [--all]
//
// Lists EVERY largest-contentful-paint candidate the page produces, in order,
// not just the final one. The final entry alone says which element won; the
// full list says which element it took the crown from and at what time, which
// is the only way to tell "the winner paints late" apart from "the runner-up
// never paints at all".
//
// `size` is LCP's own number (intrinsic area capped at displayed area for
// images, text-block area for text), so the elements are comparable to each
// other the way the browser compares them - not by getBoundingClientRect.
//
// --consent sets the consent cookie before navigating, which removes the banner
// from the run entirely. Diffing the two runs shows what the LCP would be
// without it, i.e. for every returning visitor.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

const url = argOf('url', 'http://localhost:3211/')
const width = Number(argOf('width', '412'))
const height = Number(argOf('height', '823'))
const dpr = Number(argOf('dpr', '1.75'))
const cpuThrottle = Number(argOf('cpu', '1'))

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const INSTALL = `
window.__lcp = []
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    const el = e.element
    let sel = null
    if (el) {
      sel = el.tagName.toLowerCase()
      if (el.id) sel += '#' + el.id
      const cls = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3)
      if (cls.length) sel += '.' + cls.join('.')
      const p = el.parentElement
      if (p) {
        const pc = (p.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2)
        sel = p.tagName.toLowerCase() + (pc.length ? '.' + pc.join('.') : '') + ' > ' + sel
      }
    }
    window.__lcp.push({
      t: Math.round((e.renderTime || e.loadTime) * 10) / 10,
      size: e.size,
      url: e.url || null,
      selector: sel,
      text: el && !e.url ? (el.textContent || '').trim().slice(0, 40) : null,
    })
  }
}).observe({ type: 'largest-contentful-paint', buffered: true })

window.__paint = []
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    window.__paint.push({ name: e.name, t: Math.round(e.startTime * 10) / 10 })
  }
}).observe({ type: 'paint', buffered: true })
`

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
  isMobile: width < 768,
  hasTouch: width < 768,
  locale: 'he-IL',
})

if (hasFlag('consent')) {
  const u = new URL(url)
  await context.addCookies([
    {
      name: 'ke_consent',
      value: encodeURIComponent('granted.1'),
      domain: u.hostname,
      path: '/',
    },
  ])
}

const page = await context.newPage()
await page.addInitScript(INSTALL)

if (cpuThrottle > 1 || hasFlag('slow4g')) {
  const cdp = await context.newCDPSession(page)
  if (cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
  // Lighthouse's own mobile numbers: 1.6Mbps down, 750Kbps up, 150ms RTT.
  //
  // This matters more than it looks. Lighthouse SIMULATES this link over a
  // graph it builds from an unthrottled run, and on localhost every resource
  // arrives inside the first half second, so the graph it charges LCP for
  // contains the whole page. Emulating the link for real is the only way to
  // measure whether a paint actually waits on the JS bundle or merely appears
  // to in the simulation.
  if (hasFlag('slow4g')) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
  }
}

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(6000)

const lcp = await page.evaluate(() => window.__lcp)
const paint = await page.evaluate(() => window.__paint)
const bannerBox = await page.evaluate(() => {
  const el = document.querySelector('section[aria-label*="הסכמה"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }
})

// The header states every condition the run was given, including the ones that
// did nothing. An unrecognised flag is silently ignored by argv parsing, so a
// run that was never throttled prints exactly like one that was, and two of
// those side by side read as a before/after.
console.log(
  `\n=== ${url}  ${width}x${height} dpr ${dpr}  cpu/${cpuThrottle}  net ${
    hasFlag('slow4g') ? 'slow4g 1.6Mbps/150ms' : 'unthrottled'
  }${hasFlag('consent') ? '  [consent set]' : ''} ===`,
)
for (const p of paint) console.log(`${String(p.t).padStart(8)}ms  ${p.name}`)
console.log('')
console.log(`${'time'.padStart(8)}  ${'size'.padStart(8)}  element`)
for (const e of lcp) {
  const what = e.url ? e.url.replace(/^https?:\/\/[^/]+/, '') : `"${e.text}"`
  console.log(
    `${String(e.t).padStart(6)}ms  ${String(e.size).padStart(8)}  ${e.selector}\n${' '.repeat(18)}${what.slice(0, 110)}`,
  )
}
console.log(`\nfinal LCP: ${lcp.at(-1)?.t}ms  size ${lcp.at(-1)?.size}  ${lcp.at(-1)?.selector}`)
console.log(
  `consent banner: ${bannerBox ? `${bannerBox.w}x${bannerBox.h} at top ${bannerBox.top}` : 'absent'}`,
)

await browser.close()
